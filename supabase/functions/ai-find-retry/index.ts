import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// "Show me a different match" retry for the AI Find results page.
// Runs one side (vano OR web) again with an exclusion list so we
// never re-suggest the pick the client just thumbs-downed. Hard-capped
// at 1 retry per side per request to keep Gemini + Serper costs bounded.
//
// Retrying does NOT create a new ai_find_requests row or a new charge —
// it mutates the existing row, replacing the current pick and pushing
// the old pick into rejected_*. The client just polls the same id and
// sees the new card.

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_MODEL = 'gemini-2.0-flash';
const SERPER_URL = 'https://google.serper.dev/search';
const VANO_CANDIDATE_LIMIT = 20;
const SERPER_RESULT_LIMIT = 10;
const BRIEF_MAX_CHARS = 2000;
const MAX_RETRIES_PER_SIDE = 1;

async function callGemini(apiKey, systemPrompt, userPrompt, toolName, toolSchema) {
  const resp = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      tools: [{ type: 'function', function: { name: toolName, parameters: toolSchema } }],
      tool_choice: { type: 'function', function: { name: toolName } },
    }),
  });
  if (!resp.ok) {
    console.error('[ai-find-retry] gemini error', resp.status, (await resp.text().catch(() => '')).slice(0, 300));
    return null;
  }
  const data = await resp.json();
  const argsJson = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (typeof argsJson !== 'string') return null;
  try { return JSON.parse(argsJson); } catch { return null; }
}

async function retryVano(supabase, row, rejectedIds, lovableKey) {
  const selectCols = `
    user_id,
    title,
    description,
    category,
    rate_min,
    rate_max,
    rate_unit,
    student_profiles:student_profiles!inner(skills, bio)
  `;
  let query = supabase
    .from('community_posts')
    .select(selectCols)
    .eq('moderation_status', 'approved')
    .limit(VANO_CANDIDATE_LIMIT);
  if (row.category) query = query.eq('category', row.category);
  if (rejectedIds.length > 0) query = query.not('user_id', 'in', `(${rejectedIds.join(',')})`);

  let { data: rows } = await query;
  if (!rows || rows.length === 0) {
    // Fall back to any category (same fallback pattern as the main fn)
    const { data: fallback } = await supabase
      .from('community_posts')
      .select(selectCols)
      .eq('moderation_status', 'approved')
      .not('user_id', 'in', rejectedIds.length > 0 ? `(${rejectedIds.join(',')})` : '(00000000-0000-0000-0000-000000000000)')
      .limit(VANO_CANDIDATE_LIMIT);
    rows = fallback ?? [];
  }

  const candidates = rows.map((r) => {
    const sp = r.student_profiles ?? null;
    return {
      user_id: r.user_id,
      title: r.title ?? '',
      description: (r.description ?? '').slice(0, 300),
      skills: sp?.skills ?? null,
      bio: sp?.bio ? sp.bio.slice(0, 300) : null,
      rate_min: r.rate_min ?? null,
      rate_max: r.rate_max ?? null,
      rate_unit: r.rate_unit ?? null,
    };
  });
  if (candidates.length === 0) return null;

  const parsed = await callGemini(
    lovableKey,
    "You re-rank Vano freelancers against a client brief. The client thumbs-downed the previous pick and wants a different one. Return ONE best user_id (NOT any from the rejected list) with a 0-100 match score + one-sentence reason. If none are a reasonable fit, set match_score to 0.",
    `Brief: ${row.brief}\nCategory: ${row.category ?? 'any'}\nBudget: ${row.budget_range ?? 'any'}\nLocation: ${row.location ?? 'any'}\n\nCandidates:\n${JSON.stringify(candidates)}`,
    'return_vano_pick',
    {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        match_score: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['user_id', 'match_score', 'reason'],
      additionalProperties: false,
    },
  );
  if (!parsed) return null;
  const userId = typeof parsed.user_id === 'string' ? parsed.user_id : null;
  const score = typeof parsed.match_score === 'number' ? parsed.match_score : 0;
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, 280) : null;
  if (!userId || score < 40) return null;
  if (!candidates.some((c) => c.user_id === userId)) return null;
  return { userId, reason };
}

async function retryWeb(supabase, row, rejectedUrls, lovableKey, serperKey) {
  // Generate a fresh search query (Gemini phrases it slightly
  // differently on each run) so we're not re-scoring the same organic
  // results.
  const queryParsed = await callGemini(
    lovableKey,
    'You write a single Google search query to find a freelancer for a client brief. Bias toward Behance, Dribbble, GitHub, LinkedIn, personal sites. Do NOT include Fiverr or Upwork. The client rejected the previous pick — phrase the query slightly differently so new results surface.',
    `Brief: ${row.brief}\nCategory: ${row.category ?? 'any'}\nLocation: ${row.location ?? 'any'}`,
    'return_query',
    {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  );
  const q = queryParsed && typeof queryParsed.query === 'string' ? queryParsed.query.trim().slice(0, 200) : null;
  if (!q) return null;

  const serperResp = await fetch(SERPER_URL, {
    method: 'POST',
    headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, num: SERPER_RESULT_LIMIT }),
  });
  if (!serperResp.ok) return null;
  const serperData = await serperResp.json();
  const organic = Array.isArray(serperData?.organic) ? serperData.organic : [];
  // Filter out rejected URLs before passing to Gemini so it can't
  // even see the old pick — prevents "same result in a new wrapper".
  const filtered = organic
    .slice(0, SERPER_RESULT_LIMIT)
    .filter((r) => !rejectedUrls.includes(r?.link ?? ''));
  if (filtered.length === 0) return null;

  const parsed = await callGemini(
    lovableKey,
    'You pick the single best freelancer from Google search results. Extract name, portfolio URL, platform, skills, location, and any visible contact info. Score 0-100; 0 if no real freelancer. Do NOT invent contact details.',
    `Brief: ${row.brief}\nCategory: ${row.category ?? 'any'}\nLocation: ${row.location ?? 'any'}\n\nResults:\n${JSON.stringify(filtered)}`,
    'return_web_pick',
    {
      type: 'object',
      properties: {
        name: { type: 'string' },
        portfolio_url: { type: 'string' },
        source_platform: {
          type: 'string',
          enum: ['behance', 'dribbble', 'github', 'linkedin', 'website', 'youtube', 'twitter', 'other'],
        },
        bio: { type: 'string' },
        skills: { type: 'array', items: { type: 'string' } },
        location: { type: 'string' },
        contact_email: { type: 'string' },
        contact_instagram: { type: 'string' },
        contact_linkedin: { type: 'string' },
        match_score: { type: 'number' },
      },
      required: ['name', 'portfolio_url', 'source_platform', 'match_score'],
      additionalProperties: false,
    },
  );
  if (!parsed) return null;
  const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
  const portfolioUrl = typeof parsed.portfolio_url === 'string' ? parsed.portfolio_url.trim() : '';
  const score = typeof parsed.match_score === 'number' ? parsed.match_score : 0;
  if (!name || !portfolioUrl || !portfolioUrl.startsWith('http') || score < 40) return null;
  if (rejectedUrls.includes(portfolioUrl)) return null;
  return {
    name,
    portfolio_url: portfolioUrl,
    source_platform: typeof parsed.source_platform === 'string' ? parsed.source_platform : 'other',
    bio: typeof parsed.bio === 'string' ? parsed.bio.slice(0, 500) : null,
    skills: Array.isArray(parsed.skills) ? parsed.skills.filter((s) => typeof s === 'string').slice(0, 10) : [],
    location: typeof parsed.location === 'string' ? parsed.location.slice(0, 100) : null,
    contact_email: typeof parsed.contact_email === 'string' ? parsed.contact_email.slice(0, 200) : null,
    contact_instagram: typeof parsed.contact_instagram === 'string' ? parsed.contact_instagram.slice(0, 100) : null,
    contact_linkedin: typeof parsed.contact_linkedin === 'string' ? parsed.contact_linkedin.slice(0, 300) : null,
    match_score: score,
  };
}

async function insertOrFindWebScout(supabase, row, candidate) {
  const { data: existing } = await supabase
    .from('scouted_freelancers')
    .select('id')
    .eq('portfolio_url', candidate.portfolio_url)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: inserted, error } = await supabase
    .from('scouted_freelancers')
    .insert({
      requester_id: row.requester_id,
      brief_snapshot: row.brief.slice(0, BRIEF_MAX_CHARS),
      name: candidate.name,
      bio: candidate.bio,
      skills: candidate.skills,
      location: candidate.location,
      source_platform: candidate.source_platform,
      source_url: candidate.portfolio_url,
      portfolio_url: candidate.portfolio_url,
      contact_email: candidate.contact_email,
      contact_instagram: candidate.contact_instagram,
      contact_linkedin: candidate.contact_linkedin,
      match_score: candidate.match_score,
      status: 'new',
    })
    .select('id')
    .single();
  if (error) return null;
  return inserted?.id ?? null;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string) => new Response(
    JSON.stringify({ error }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY');
    if (!GEMINI_API_KEY || !SERPER_API_KEY) return bad(500, 'Missing keys');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    // Verify the caller owns the ai_find_requests row.
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return bad(401, 'Unauthorized');
    const callerId = claimsData.claims.sub;

    const body = await req.json().catch(() => ({}));
    const requestId = typeof body?.request_id === 'string' ? body.request_id : null;
    const side = body?.side === 'vano' ? 'vano' : body?.side === 'web' ? 'web' : null;
    if (!requestId || !side) return bad(400, 'request_id + side required');

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: row, error: rowErr } = await supabase
      .from('ai_find_requests')
      .select('id, requester_id, brief, category, budget_range, timeline, location, vano_match_user_id, web_scout_id, rejected_vano_user_ids, rejected_web_portfolio_urls, vano_retry_count, web_retry_count, status')
      .eq('id', requestId)
      .maybeSingle();
    if (rowErr || !row) return bad(404, 'Request not found');
    if (row.requester_id !== callerId) return bad(403, 'Forbidden');
    if (row.status !== 'complete') return bad(409, 'Request is not complete yet');

    const currentRetries = side === 'vano' ? row.vano_retry_count : row.web_retry_count;
    if (currentRetries >= MAX_RETRIES_PER_SIDE) {
      return bad(429, 'Retry limit reached for this side');
    }

    if (side === 'vano') {
      const rejected = [...(row.rejected_vano_user_ids ?? [])];
      if (row.vano_match_user_id) rejected.push(row.vano_match_user_id);

      const pick = await retryVano(supabase, row, rejected, GEMINI_API_KEY);
      if (!pick) return bad(404, 'No alternative Vano match found');

      await supabase
        .from('ai_find_requests')
        .update({
          vano_match_user_id: pick.userId,
          vano_match_reason: pick.reason,
          rejected_vano_user_ids: rejected,
          vano_retry_count: currentRetries + 1,
          vano_match_feedback: null,
        })
        .eq('id', requestId);

      return new Response(
        JSON.stringify({ ok: true, new_user_id: pick.userId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // side === 'web'
    const rejectedUrls = [...(row.rejected_web_portfolio_urls ?? [])];
    // Look up the current scout's portfolio_url to add to rejected.
    if (row.web_scout_id) {
      const { data: currentScout } = await supabase
        .from('scouted_freelancers')
        .select('portfolio_url')
        .eq('id', row.web_scout_id)
        .maybeSingle();
      if (currentScout?.portfolio_url) rejectedUrls.push(currentScout.portfolio_url);
    }

    const pick = await retryWeb(supabase, row, rejectedUrls, GEMINI_API_KEY, SERPER_API_KEY);
    if (!pick) return bad(404, 'No alternative web match found');

    const newScoutId = await insertOrFindWebScout(supabase, row, pick);
    if (!newScoutId) return bad(500, 'Could not save the new scout');

    await supabase
      .from('ai_find_requests')
      .update({
        web_scout_id: newScoutId,
        rejected_web_portfolio_urls: rejectedUrls,
        web_retry_count: currentRetries + 1,
        web_match_feedback: null,
      })
      .eq('id', requestId);

    return new Response(
      JSON.stringify({ ok: true, new_scout_id: newScoutId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[ai-find-retry] unhandled', err);
    return bad(500, 'internal_error');
  }
});
