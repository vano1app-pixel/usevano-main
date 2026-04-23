// Weekly re-engagement digest for dormant users.
//
// Two segments:
//   1. Freelancers with an approved community listing who haven't
//      updated their profile in 7+ days. Nudge them to flip the
//      Available this week? toggle or polish their listing.
//   2. Hirers (user_type='business') who've been quiet for 7+ days.
//      Nudge them back to /hire with social-proof copy.
//
// Invocation patterns:
//   - `POST /functions/v1/weekly-digest?dry_run=true` — logs counts +
//     example payload, sends zero emails. Default.
//   - `POST /functions/v1/weekly-digest?dry_run=false` — actually
//     sends via Resend.
//   - Gated by an `Authorization: Bearer <CRON_SECRET>` header so it
//     can only be invoked by the founder or the cron job, never an
//     anonymous crawler.
//
// Wiring cron: the founder can hook this up via Supabase's pg_cron
// or Vercel Cron by POSTing to the function URL once a week. Until
// then, invoke manually with dry_run=true to sanity-check the target
// count, then flip to dry_run=false to do a live send.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  user_type: string | null;
};

type StudentProfileRow = {
  user_id: string;
  community_board_status: string | null;
  updated_at: string | null;
  is_available: boolean | null;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchEmailForUser(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  // `auth.admin.getUserById` returns the whole auth.users row including
  // the email. Wrapped because a missing user or permission error
  // shouldn't fail the whole batch.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (adminClient.auth.admin as any).getUserById(userId);
    if (error || !data?.user?.email) return null;
    return data.user.email as string;
  } catch {
    return null;
  }
}

async function sendEmail(opts: {
  resendKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      console.warn(`[weekly-digest] Resend ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[weekly-digest] Resend fetch failed", err);
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Deno?.serve?.(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Deno = (globalThis as any).Deno;

  // Shared secret gate. Without this the function URL is public and
  // anyone could trigger a paid email blast.
  const cronSecret = Deno.env.get("WEEKLY_DIGEST_SECRET")?.trim();
  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!cronSecret || authHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  // Defaults to TRUE so a misconfigured cron doesn't ship a live
  // blast by accident. Flip to false only when you've seen the
  // dry_run counts and are happy.
  const dryRun = (url.searchParams.get("dry_run") ?? "true").toLowerCase() !== "false";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim() || "";
  const from = Deno.env.get("RESEND_FROM")?.trim() || "VANO <onboarding@resend.dev>";
  const siteUrl = (Deno.env.get("SITE_URL")?.trim() || "https://vanojobs.com").replace(/\/+$/, "");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "missing supabase env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const sinceIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  /* ─── 1. Dormant freelancers ─── */
  const { data: freelancers } = await adminClient
    .from("student_profiles")
    .select("user_id, community_board_status, updated_at, is_available")
    .eq("community_board_status", "approved")
    .lt("updated_at", sinceIso)
    .limit(500);

  /* ─── 2. Dormant hirers ─── */
  // "Dormant hirer" is harder to define cheaply — for now we pick
  // business-type profiles whose most recent hire_requests row is >7
  // days old. Founder can sharpen later (maybe "signed in >7d ago"
  // would be truer). Keeping the query simple until we have real
  // numbers to tune against.
  const { data: hirerProfiles } = await adminClient
    .from("profiles")
    .select("user_id, display_name, user_type")
    .eq("user_type", "business")
    .limit(500);

  const hirerUserIds = (hirerProfiles ?? []).map((p: ProfileRow) => p.user_id);
  const { data: recentHires } = hirerUserIds.length > 0
    ? await adminClient
      .from("hire_requests")
      .select("requester_id, created_at")
      .in("requester_id", hirerUserIds)
      .gte("created_at", sinceIso)
    : { data: [] };
  const activeHirerIds = new Set(
    (recentHires ?? []).map((r: { requester_id: string }) => r.requester_id),
  );
  const dormantHirers = (hirerProfiles ?? []).filter(
    (p: ProfileRow) => !activeHirerIds.has(p.user_id),
  );

  let freelancersSent = 0;
  let freelancersSkipped = 0;
  let hirersSent = 0;
  let hirersSkipped = 0;

  for (const f of (freelancers ?? []) as StudentProfileRow[]) {
    const email = await fetchEmailForUser(adminClient, f.user_id);
    if (!email) { freelancersSkipped += 1; continue; }
    const subject = "Your VANO profile is waiting — new hires this week";
    const text = [
      `Hi,`,
      ``,
      `Businesses are hiring on VANO every day — a fresh profile shows up higher in AI Find matches.`,
      ``,
      `Two quick things that make the biggest difference:`,
      `  1. Flip "Available this week" on your profile if you're open to work.`,
      `  2. Add one new sample or skill to keep your listing current.`,
      ``,
      `Open your profile: ${siteUrl}/profile`,
      ``,
      `— VANO`,
    ].join("\n");
    if (dryRun) {
      console.log(`[weekly-digest][dry] freelancer ${f.user_id} ← ${email}`);
      freelancersSent += 1;
      continue;
    }
    if (!resendKey) { freelancersSkipped += 1; continue; }
    const ok = await sendEmail({ resendKey, from, to: email, subject, text });
    if (ok) freelancersSent += 1; else freelancersSkipped += 1;
  }

  for (const h of dormantHirers as ProfileRow[]) {
    const email = await fetchEmailForUser(adminClient, h.user_id);
    if (!email) { hirersSkipped += 1; continue; }
    const subject = "New freelancers joined VANO this week";
    const text = [
      `Hi ${h.display_name ?? "there"},`,
      ``,
      `New freelancers have joined VANO since you were last here.`,
      ``,
      `Your next hire is one brief away — €1 gets you a hand-picked match in under a minute, refunded if we can't find a fit.`,
      ``,
      `Post a brief: ${siteUrl}/hire`,
      ``,
      `— VANO`,
    ].join("\n");
    if (dryRun) {
      console.log(`[weekly-digest][dry] hirer ${h.user_id} ← ${email}`);
      hirersSent += 1;
      continue;
    }
    if (!resendKey) { hirersSkipped += 1; continue; }
    const ok = await sendEmail({ resendKey, from, to: email, subject, text });
    if (ok) hirersSent += 1; else hirersSkipped += 1;
  }

  return new Response(
    JSON.stringify({
      dry_run: dryRun,
      freelancers: { sent: freelancersSent, skipped: freelancersSkipped, dormant_total: (freelancers ?? []).length },
      hirers: { sent: hirersSent, skipped: hirersSkipped, dormant_total: dormantHirers.length },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
