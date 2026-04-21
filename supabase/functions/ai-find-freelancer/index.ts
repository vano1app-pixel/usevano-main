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

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const SERPER_URL = 'https://google.serper.dev/search';
const VANO_CANDIDATE_LIMIT = 20;
const SERPER_RESULT_LIMIT = 10;
const BRIEF_MAX_CHARS = 2000;
// Per-call budgets for external APIs. Without these, a stuck Gemini or
// Serper request would block the edge function indefinitely — long past
// the 120s the results page polls for — and strand the user on "Just a
// moment more…" with no refund path. On abort the fetch rejects, which
// propagates up to the per-side .catch in the Promise.all below and
// becomes a null pick; if both sides end up null, markFailed fires the
// auto-refund. Stripe gets a shorter budget because it's only reached on
// the failure path and we don't want to pile timeout on top of timeout.
const EXTERNAL_CALL_TIMEOUT_MS = 30_000;
const STRIPE_CALL_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      console.error(`[ai-find-freelancer] ${label} aborted after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

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
  // Match-quality signals — added so Gemini can actually weigh
  // "has 5 reviews at 4.8 stars, Vano Pay-ready" over "empty profile
  // with 0 reviews and no payouts". Before this, the prompt was
  // scoring on bio prose alone and had no way to prefer the real
  // operators over the drive-bys.
  avg_rating: number | null;      // 0-5 star average, null if no reviews
  review_count: number;            // total reviews received
  vano_pay_ready: boolean;         // stripe_payouts_enabled — can actually be paid through Vano
  verified: boolean;               // student_verified — email-confirmed
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
    const resp = await fetchWithTimeout(
      'https://api.stripe.com/v1/refunds',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `payment_intent=${encodeURIComponent(paymentIntentId)}`,
      },
      STRIPE_CALL_TIMEOUT_MS,
      'stripe refund',
    );
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
  const resp = await fetchWithTimeout(
    GEMINI_URL,
    {
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
    },
    EXTERNAL_CALL_TIMEOUT_MS,
    `gemini ${toolName}`,
  );

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
): Promise<{ userId: string; reason: string | null; score: number } | null> {
  // Pull the top N approved community listings. Try the brief's
  // category first; if that returns zero rows (e.g. a category with
  // no published freelancers yet, or a typo in the DB), fall back to
  // the full approved pool and let Gemini filter by the brief's
  // context. Without this fallback, a popular-category brief hitting
  // an under-filled category would silently return null and only the
  // web pick would show.
  // Pull the listing + the student_profiles flags that matter for
  // match quality (student_verified, stripe_payouts_enabled). Reviews
  // are a second round-trip below because Postgres doesn't do nested
  // aggregates through PostgREST cleanly.
  const selectCols = `
      user_id,
      title,
      description,
      category,
      rate_min,
      rate_max,
      rate_unit,
      student_profiles:student_profiles!inner(skills, bio, student_verified, stripe_payouts_enabled)
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

  // Batch-fetch review aggregates for the candidate pool in one round-
  // trip. Without this, Gemini ranks a brand-new freelancer the same
  // as a seasoned one with 10 five-star reviews — the single biggest
  // accuracy gap in the old ranking. Aggregates are computed client-
  // side because PostgREST doesn't expose GROUP BY for anon users.
  const candidateUserIds = (rows ?? [])
    .map((r: Record<string, unknown>) => r.user_id as string | undefined)
    .filter((id): id is string => typeof id === 'string');

  const ratingByUserId = new Map<string, { avg: number; count: number }>();
  if (candidateUserIds.length > 0) {
    const { data: reviewRows, error: reviewErr } = await supabase
      .from('reviews')
      .select('reviewee_id, rating')
      .in('reviewee_id', candidateUserIds);
    if (reviewErr) {
      console.warn('[ai-find-freelancer] review aggregate fetch failed, ranking without ratings', reviewErr.message);
    } else {
      const buckets = new Map<string, number[]>();
      for (const r of (reviewRows ?? []) as Array<{ reviewee_id: string; rating: number }>) {
        const arr = buckets.get(r.reviewee_id) ?? [];
        arr.push(r.rating);
        buckets.set(r.reviewee_id, arr);
      }
      for (const [userId, ratings] of buckets.entries()) {
        if (ratings.length === 0) continue;
        const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
        ratingByUserId.set(userId, { avg: Math.round(avg * 10) / 10, count: ratings.length });
      }
    }
  }

  const candidates: VanoCandidate[] = (rows ?? []).map((r: Record<string, unknown>) => {
    const sp = (r.student_profiles as {
      skills?: string[];
      bio?: string;
      student_verified?: boolean;
      stripe_payouts_enabled?: boolean;
    } | null) ?? null;
    const userId = r.user_id as string;
    const rating = ratingByUserId.get(userId);
    return {
      user_id: userId,
      title: (r.title as string) ?? '',
      description: ((r.description as string) ?? '').slice(0, 300),
      category: (r.category as string | null) ?? null,
      rate_min: (r.rate_min as number | null) ?? null,
      rate_max: (r.rate_max as number | null) ?? null,
      rate_unit: (r.rate_unit as string | null) ?? null,
      skills: sp?.skills ?? null,
      bio: sp?.bio ? sp.bio.slice(0, 300) : null,
      avg_rating: rating?.avg ?? null,
      review_count: rating?.count ?? 0,
      vano_pay_ready: !!sp?.stripe_payouts_enabled,
      verified: !!sp?.student_verified,
    };
  });

  if (candidates.length === 0) return null;

  // Ranking system prompt — explicit weighting so Gemini doesn't
  // default to ranking on bio prose alone (which was the old
  // behaviour and favoured verbose writers over actual fit).
  //
  // Priorities, in order:
  //   1. Skill / category match against the brief.
  //   2. Review signal — avg_rating * log(review_count + 1). A
  //      freelancer with 5 reviews at 4.8 beats a freelancer with
  //      zero track record even if the bio is marginally tighter.
  //   3. vano_pay_ready — the hirer came to pay, so prefer someone
  //      who can actually accept a Vano Pay charge.
  //   4. Budget fit against rate_min/rate_max if budget is given.
  //   5. Verification status as a small tiebreaker.
  //
  // Keep reason concise — it renders as "Why Vano picked them" on
  // the result card, and runs under 280 chars of italic quote.
  const parsed = await callGemini(
    lovableKey,
    `You rank freelancers in Vano's internal pool against a client brief. Return ONE best user_id with a 0-100 match score.

Score weighting:
- 60%: skill + category + description fit against the brief
- 20%: review signal (avg_rating * log(review_count + 1)); null rating = neutral, not negative
- 10%: vano_pay_ready=true preferred — client can actually pay this freelancer safely
- 5%: budget fit against rate_min/rate_max if the brief gives a budget
- 5%: verified=true as a tiebreaker

Set match_score to 0 if no candidate is a reasonable fit for the brief — don't force a pick.
Keep "reason" under 240 chars, concrete and grounded in the candidate's fields (not generic fluff).`,
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

  // Deterministic fallback ranker. Used whenever Gemini either (a)
  // failed outright, (b) scored every candidate below the confidence
  // cutoff, or (c) hallucinated a user_id that isn't in our pool.
  // Without this, a brief where Gemini can't find a "great" fit would
  // return null and the hirer's €1 would refund even though we have a
  // perfectly-serviceable freelancer sitting in the matching category.
  // The user would rather see a decent-but-not-perfect pick than get
  // their money back and a dead end.
  //
  // Ranking mirrors the weighting Gemini uses for interpretability —
  // review signal first, then vano_pay_ready, then verified, then a
  // stable tiebreak on user_id so results are reproducible.
  const rankDeterministic = (c: VanoCandidate): number => {
    const reviewSignal = c.avg_rating != null
      ? c.avg_rating * Math.log(c.review_count + 1)
      : 0;
    return reviewSignal * 100
      + (c.vano_pay_ready ? 10 : 0)
      + (c.verified ? 2 : 0);
  };
  const fallbackPick = (): { userId: string; reason: string | null; score: number } => {
    const sorted = [...candidates].sort((a, b) => {
      const diff = rankDeterministic(b) - rankDeterministic(a);
      if (diff !== 0) return diff;
      return a.user_id.localeCompare(b.user_id);
    });
    const top = sorted[0];
    // Reason reads honestly — we didn't have a tailored match, but
    // this is a real freelancer from the relevant category. UI can
    // still render it as a suggestion.
    const categoryNote = row.category ? ` from our ${row.category.replace(/_/g, ' ')} pool` : '';
    const ratingNote = top.avg_rating != null && top.review_count > 0
      ? ` · ${top.avg_rating.toFixed(1)}★ (${top.review_count} ${top.review_count === 1 ? 'review' : 'reviews'})`
      : '';
    return {
      userId: top.user_id,
      reason: `A top-ranked freelancer${categoryNote}${ratingNote}. Start a chat to see if they're a fit.`,
      // 40 is the confidence cutoff — label fallback picks just below
      // so the UI can distinguish them from confident Gemini picks.
      score: 39,
    };
  };

  if (!parsed) {
    console.warn('[ai-find-freelancer] gemini returned no parse — using deterministic fallback');
    return fallbackPick();
  }
  const userId = typeof parsed.user_id === 'string' ? parsed.user_id : null;
  const score = typeof parsed.match_score === 'number' ? parsed.match_score : 0;
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, 280) : null;

  // Low confidence → fall back to deterministic pick so the hirer
  // always sees someone, not a refund.
  if (!userId || score < 40) {
    console.info('[ai-find-freelancer] gemini low-confidence (score=%d) — using deterministic fallback', score);
    return fallbackPick();
  }
  // Sanity-check the returned id against the candidate list. Gemini
  // occasionally hallucinates UUIDs; we'd rather show our deterministic
  // pick than ship an invalid FK.
  if (!candidates.some((c) => c.user_id === userId)) {
    console.warn('[ai-find-freelancer] gemini hallucinated id %s — using deterministic fallback', userId);
    return fallbackPick();
  }
  return { userId, reason: reason || null, score: Math.max(0, Math.min(100, Math.round(score))) };
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
  const resp = await fetchWithTimeout(
    SERPER_URL,
    {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: SERPER_RESULT_LIMIT }),
    },
    EXTERNAL_CALL_TIMEOUT_MS,
    'serper search',
  );
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
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY');
    // STRIPE_SECRET_KEY is optional here — only needed for auto-refund
    // on failure. If missing, a failed request flips to 'failed' with
    // the "manual refund required" note so ops can handle it.
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? null;
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), { status: 500 });
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
      pickVanoMatch(supabase, row, GEMINI_API_KEY).catch((err) => {
        console.error('[ai-find-freelancer] vano pick crashed', err);
        return null;
      }),
      (async () => {
        const query = await buildSearchQuery(row, GEMINI_API_KEY);
        if (!query) return null;
        const results = await serperSearch(query, SERPER_API_KEY);
        return extractWebCandidate(row, results, GEMINI_API_KEY);
      })().catch((err) => {
        console.error('[ai-find-freelancer] web pick crashed', err);
        return null;
      }),
    ]);
    const vanoUserId = vanoPick?.userId ?? null;
    const vanoReason = vanoPick?.reason ?? null;
    const vanoScore = vanoPick?.score ?? null;

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
        vano_match_score: vanoScore,
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
