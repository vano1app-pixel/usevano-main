import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Runs the €1 AI Find for a single ai_find_requests row. Invoked by
// stripe-webhook once payment is confirmed (service role auth). Does:
//   1. Load + lock-flip paid → scouting (idempotent on double-call).
//   2. Vano pick: query community_posts + student_profiles, let Gemini
//      rank the brief against the top 20 candidates.
//   3. Web pick: Gemini → Serper query → top 10 results → Gemini
//      extracts the single best freelancer candidate + contact.
//      Inserted as a scouted_freelancers row with a claim_token.
//   4. Persist FKs on the request, flip to complete (or failed).
//
// verify_jwt=false. Callers pass the service-role JWT explicitly; we
// don't re-verify it here because the only trigger is the webhook and
// spoofed calls only ever re-process rows, which is bounded by the
// status check.

const GEMINI_MODEL = 'google/gemini-3-flash-preview';
const GEMINI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const SERPER_URL = 'https://google.serper.dev/search';
const VANO_CANDIDATE_LIMIT = 20;
const SERPER_RESULT_LIMIT = 10;
const BRIEF_MAX_CHARS = 2000;

type AiFindRow = {
  id: string;
  requester_id: string;
  brief: string;
  category: string | null;
  budget_range: string | null;
  timeline: string | null;
  location: string | null;
  status: string;
  stripe_payment_intent_id: string | null;
};

type VanoCandidate = {
  user_id: string;
  title: string;
  description: string;
  category: string | null;
  rate_min: number | null;
  rate_max: number | null;
  rate_unit: string | null;
  skills: string[] | null;
  bio: string | null;
};

type SerperResult = {
  title: string;
  link: string;
  snippet?: string;
  position?: number;
};

type WebCandidate = {
  name: string;
  portfolio_url: string;
  source_platform: string;
  bio: string | null;
  skills: string[];
  location: string | null;
  contact_email: string | null;
  contact_instagram: string | null;
  contact_linkedin: string | null;
  match_score: number;
};

// Auto-refund a payment via the Stripe API. Returns true on success.
// We use the payment_intent form so Stripe picks up the underlying
// charge automatically — safer than tracking charge_id separately.
async function refundViaStripe(
  paymentIntentId: string,
  stripeKey: string,
): Promise<boolean> {
  try {
    const resp = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `payment_intent=${encodeURIComponent(paymentIntentId)}`,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('[ai-find-freelancer] stripe refund failed', resp.status, text.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[ai-find-freelancer] refund threw', err);
    return false;
  }
}

// Marks the request failed AND tries to auto-refund via Stripe. If the
// refund goes through, status flips to 'refunded' and the UI shows
// "Your €1 has been refunded". If the refund call fails (Stripe
// outage, missing payment intent id), status stays 'failed' with a
// note appended to error_message so ops can refund manually.
async function markFailed(
  supabase: ReturnType<typeof createClient>,
  requestId: string,
  paymentIntentId: string | null,
  stripeKey: string | null,
  message: string,
): Promise<void> {
  let refunded = false;
  if (paymentIntentId && stripeKey) {
    refunded = await refundViaStripe(paymentIntentId, stripeKey);
  }

  const errorMessage = refunded
    ? message.slice(0, 500)
    : `${message.slice(0, 450)} (manual refund required)`;

  await supabase
    .from('ai_find_requests')
    .update({
      status: refunded ? 'refunded' : 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', requestId);
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  toolName: string,
  toolSchema: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const resp = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
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
    const text = await resp.text().catch(() => '');
    console.error('[ai-find-freelancer] gemini error', resp.status, text.slice(0, 300));
    return null;
  }

  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  const argsJson = call?.function?.arguments;
  if (typeof argsJson !== 'string') return null;
  try {
    return JSON.parse(argsJson);
  } catch {
    return null;
  }
}

async function pickVanoMatch(
  supabase: ReturnType<typeof createClient>,
  row: AiFindRow,
  lovableKey: string,
): Promise<{ userId: string; reason: string | null } | null> {
  // Pull the top N approved community listings. Try the brief's
  // category first; if that returns zero rows (e.g. a category with
  // no published freelancers yet, or a typo in the DB), fall back to
  // the full approved pool and let Gemini filter by the brief's
  // context. Without this fallback, a popular-category brief hitting
  // an under-filled category would silently return null and only the
  // web pick would show.
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

  let rows: unknown[] | null = null;

  if (row.category) {
    const { data, error } = await supabase
      .from('community_posts')
      .select(selectCols)
      .eq('moderation_status', 'approved')
      .eq('category', row.category)
      .limit(VANO_CANDIDATE_LIMIT);
    if (error) {
      console.error('[ai-find-freelancer] vano query (filtered) failed', error);
    } else if (data && data.length > 0) {
      rows = data as unknown[];
    }
  }

  if (!rows) {
    const { data, error } = await supabase
      .from('community_posts')
      .select(selectCols)
      .eq('moderation_status', 'approved')
      .limit(VANO_CANDIDATE_LIMIT);
    if (error) {
      console.error('[ai-find-freelancer] vano query (fallback) failed', error);
      return null;
    }
    rows = (data ?? []) as unknown[];
  }

  const candidates: VanoCandidate[] = (rows ?? []).map((r: Record<string, unknown>) => {
    const sp = (r.student_profiles as { skills?: string[]; bio?: string } | null) ?? null;
    return {
      user_id: r.user_id as string,
      title: (r.title as string) ?? '',
      description: ((r.description as string) ?? '').slice(0, 300),
      category: (r.category as string | null) ?? null,
      rate_min: (r.rate_min as number | null) ?? null,
      rate_max: (r.rate_max as number | null) ?? null,
      rate_unit: (r.rate_unit as string | null) ?? null,
      skills: sp?.skills ?? null,
      bio: sp?.bio ? sp.bio.slice(0, 300) : null,
    };
  });

  if (candidates.length === 0) return null;

  const parsed = await callGemini(
    lovableKey,
    'You rank freelancers in Vano\'s internal pool against a client brief. Return ONE best user_id with a 0-100 match score. If no candidate is a reasonable fit, set match_score to 0.',
    `Brief: ${row.brief}\nCategory: ${row.category ?? 'any'}\nBudget: ${row.budget_range ?? 'any'}\nTimeline: ${row.timeline ?? 'any'}\nLocation: ${row.location ?? 'any'}\n\nCandidates:\n${JSON.stringify(candidates)}`,
    'return_vano_pick',
    {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        match_score: { type: 'number', description: '0-100. 0 means no good fit.' },
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
  // Sanity-check the returned id against the candidate list to catch
  // hallucinations.
  if (!candidates.some((c) => c.user_id === userId)) return null;
  return { userId, reason: reason || null };
}

async function buildSearchQuery(
  row: AiFindRow,
  lovableKey: string,
): Promise<string | null> {
  const parsed = await callGemini(
    lovableKey,
    'You write a single Google search query to find the best freelancer for a client brief. Bias the query toward public portfolio sites (Behance, Dribbble, GitHub, personal sites, LinkedIn). Do NOT include Fiverr or Upwork — their profiles violate our TOS constraints.',
    `Brief: ${row.brief}\nCategory: ${row.category ?? 'any'}\nLocation: ${row.location ?? 'any'}`,
    'return_query',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Raw Google search query, <= 120 chars.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  );
  const q = parsed && typeof parsed.query === 'string' ? parsed.query.trim() : '';
  return q ? q.slice(0, 200) : null;
}

async function serperSearch(query: string, apiKey: string): Promise<SerperResult[]> {
  const resp = await fetch(SERPER_URL, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: SERPER_RESULT_LIMIT }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.error('[ai-find-freelancer] serper error', resp.status, text.slice(0, 200));
    return [];
  }
  const data = await resp.json();
  const organic = Array.isArray(data?.organic) ? data.organic : [];
  return organic.slice(0, SERPER_RESULT_LIMIT).map((r: Record<string, unknown>) => ({
    title: (r.title as string) ?? '',
    link: (r.link as string) ?? '',
    snippet: (r.snippet as string) ?? '',
    position: (r.position as number) ?? undefined,
  }));
}

async function extractWebCandidate(
  row: AiFindRow,
  results: SerperResult[],
  lovableKey: string,
): Promise<WebCandidate | null> {
  if (results.length === 0) return null;

  const parsed = await callGemini(
    lovableKey,
    'You pick the single best freelancer candidate from Google search results for a client brief. Extract what you can from the result snippets — name, portfolio URL, platform (behance | dribbble | github | linkedin | website | youtube | twitter | other), any skills mentioned, location if mentioned, and contact channels if visible. Score 0-100; use 0 if no result is a real freelancer match. Do NOT invent contact details — leave them null unless visibly present in a snippet.',
    `Brief: ${row.brief}\nCategory: ${row.category ?? 'any'}\nLocation: ${row.location ?? 'any'}\n\nResults:\n${JSON.stringify(results)}`,
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
        match_score: { type: 'number', description: '0-100. 0 means no good fit.' },
      },
      required: ['name', 'portfolio_url', 'source_platform', 'match_score'],
      additionalProperties: false,
    },
  );

  if (!parsed) return null;
  const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
  const portfolioUrl = typeof parsed.portfolio_url === 'string' ? parsed.portfolio_url.trim() : '';
  const platform = typeof parsed.source_platform === 'string' ? parsed.source_platform : 'other';
  const score = typeof parsed.match_score === 'number' ? parsed.match_score : 0;
  if (!name || !portfolioUrl || !portfolioUrl.startsWith('http') || score < 40) return null;

  return {
    name,
    portfolio_url: portfolioUrl,
    source_platform: platform,
    bio: typeof parsed.bio === 'string' ? parsed.bio.slice(0, 500) : null,
    skills: Array.isArray(parsed.skills) ? parsed.skills.filter((s) => typeof s === 'string').slice(0, 10) : [],
    location: typeof parsed.location === 'string' ? parsed.location.slice(0, 100) : null,
    contact_email: typeof parsed.contact_email === 'string' ? parsed.contact_email.slice(0, 200) : null,
    contact_instagram: typeof parsed.contact_instagram === 'string' ? parsed.contact_instagram.slice(0, 100) : null,
    contact_linkedin: typeof parsed.contact_linkedin === 'string' ? parsed.contact_linkedin.slice(0, 300) : null,
    match_score: score,
  };
}

async function insertWebScout(
  supabase: ReturnType<typeof createClient>,
  row: AiFindRow,
  candidate: WebCandidate,
): Promise<string | null> {
  // If the portfolio URL already exists (unique partial index), reuse
  // the existing scout so we don't duplicate outreach to the same real
  // person. A re-surface after the 30-day claim window might also want
  // to rotate the token — out of scope for MVP.
  const { data: existing } = await supabase
    .from('scouted_freelancers')
    .select('id')
    .eq('portfolio_url', candidate.portfolio_url)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

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

  if (error) {
    console.error('[ai-find-freelancer] scout insert failed', error);
    return null;
  }
  return (inserted?.id as string) ?? null;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // Server-to-server invocations (stripe-webhook, ai-find-retry) have no
  // Origin header so isOriginAllowed returns true; a browser trying to
  // directly hit this endpoint off-origin would be rejected here.
  if (!isOriginAllowed(req)) {
    return new Response(JSON.stringify({ error: 'Forbidden origin' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY');
    // STRIPE_SECRET_KEY is optional here — only needed for auto-refund
    // on failure. If missing, a failed request flips to 'failed' with
    // the "manual refund required" note so ops can handle it.
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? null;
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), { status: 500 });
    }
    if (!SERPER_API_KEY) {
      return new Response(JSON.stringify({ error: 'SERPER_API_KEY not configured' }), { status: 500 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const requestId = typeof body?.request_id === 'string' ? body.request_id : null;
    if (!requestId) {
      return new Response(JSON.stringify({ error: 'request_id required' }), { status: 400 });
    }

    // Flip paid → scouting. Same idempotent pattern as stripe-webhook —
    // a retry after we've already started does nothing.
    const { data: flipped } = await supabase
      .from('ai_find_requests')
      .update({ status: 'scouting' })
      .eq('id', requestId)
      .eq('status', 'paid')
      .select('id, requester_id, brief, category, budget_range, timeline, location, status, stripe_payment_intent_id')
      .maybeSingle();

    if (!flipped) {
      // Either already running (someone else picked it up) or not paid
      // yet — either way, nothing to do.
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const row = flipped as AiFindRow;

    // Run Vano and web picks in parallel — they're independent.
    const [vanoPick, webCandidate] = await Promise.all([
      pickVanoMatch(supabase, row, LOVABLE_API_KEY).catch((err) => {
        console.error('[ai-find-freelancer] vano pick crashed', err);
        return null;
      }),
      (async () => {
        const query = await buildSearchQuery(row, LOVABLE_API_KEY);
        if (!query) return null;
        const results = await serperSearch(query, SERPER_API_KEY);
        return extractWebCandidate(row, results, LOVABLE_API_KEY);
      })().catch((err) => {
        console.error('[ai-find-freelancer] web pick crashed', err);
        return null;
      }),
    ]);
    const vanoUserId = vanoPick?.userId ?? null;
    const vanoReason = vanoPick?.reason ?? null;

    let webScoutId: string | null = null;
    if (webCandidate) {
      webScoutId = await insertWebScout(supabase, row, webCandidate);
    }

    // Fire the outreach email in the background. The notify function
    // has its own idempotency guard (status='new' only), so a deduped
    // scout that was already emailed earlier is a no-op. We don't
    // await — email sends are slow and the results page polling can
    // move on without us.
    if (webScoutId) {
      const notifyUrl = `${supabaseUrl}/functions/v1/notify-scouted-freelancer`;
      const notifyPromise = fetch(notifyUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scout_id: webScoutId }),
      }).catch((err) => console.error('[ai-find-freelancer] notify trigger failed', err));

      const runtime = (globalThis as unknown as {
        EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
      }).EdgeRuntime;
      if (runtime?.waitUntil) {
        runtime.waitUntil(notifyPromise);
      }
    }

    // Complete even if only one side found something. Only mark failed
    // when BOTH sides turned up empty — the client paid €1, we owe
    // them at least one real lead or a refund path. markFailed will
    // attempt the Stripe refund automatically.
    if (!vanoUserId && !webScoutId) {
      await markFailed(supabase, requestId, row.stripe_payment_intent_id, STRIPE_SECRET_KEY, 'no_matches_found');
      return new Response(JSON.stringify({ ok: false, reason: 'no_matches' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await supabase
      .from('ai_find_requests')
      .update({
        status: 'complete',
        vano_match_user_id: vanoUserId,
        vano_match_reason: vanoReason,
        web_scout_id: webScoutId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    return new Response(
      JSON.stringify({ ok: true, vano_match_user_id: vanoUserId, web_scout_id: webScoutId }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[ai-find-freelancer] unhandled', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
});
