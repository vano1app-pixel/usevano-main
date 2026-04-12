// Expire stale pending direct hire_requests and notify the requester.
//
// Designed to be called on a schedule (e.g. every minute via pg_cron →
// `supabase.functions.invoke('expire-hire-requests')` or Supabase Scheduled Functions).
//
// Idempotent: re-running produces no side effects once everything pending is current.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Allow either service-role key calls (pg_cron, scheduled trigger) or a shared
    // secret via header for manual kicking. Reject public calls.
    const authHeader = req.headers.get("Authorization") || "";
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const isServiceRole = authHeader === `Bearer ${serviceKey}`;
    const isCronSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;
    if (!isServiceRole && !isCronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, serviceKey);

    // Fetch the requests we're about to expire so we can notify the requester.
    const nowIso = new Date().toISOString();
    const { data: toExpire, error: fetchErr } = await svc
      .from("hire_requests")
      .select("id, requester_id, target_freelancer_id")
      .eq("kind", "direct")
      .eq("status", "pending")
      .lt("expires_at", nowIso);

    if (fetchErr) {
      console.error("fetch stale hire_requests failed", fetchErr);
      return new Response(JSON.stringify({ error: "fetch_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stale = toExpire || [];
    if (stale.length === 0) {
      return new Response(JSON.stringify({ ok: true, expired: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark them expired.
    const staleIds = stale.map((r) => r.id);
    const { error: updErr } = await svc
      .from("hire_requests")
      .update({ status: "expired", responded_at: nowIso })
      .in("id", staleIds);

    if (updErr) {
      console.error("update stale hire_requests failed", updErr);
      return new Response(JSON.stringify({ error: "update_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather freelancer names to tell the requester who timed out.
    const freelancerIds = Array.from(
      new Set(stale.map((r) => r.target_freelancer_id).filter(Boolean) as string[]),
    );
    const nameMap = new Map<string, string>();
    if (freelancerIds.length > 0) {
      const { data: profs } = await svc
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", freelancerIds);
      (profs || []).forEach((p: any) => {
        nameMap.set(p.user_id, p.display_name || "The freelancer");
      });
    }

    // In-app notification for each requester
    const notifications = stale.map((r) => {
      const freelancerName = nameMap.get(r.target_freelancer_id || "") || "The freelancer";
      return {
        user_id: r.requester_id,
        title: `${freelancerName} didn't respond in time`,
        message: "We'll help you find someone else — tap to browse more available freelancers.",
        read: false,
      };
    });
    if (notifications.length > 0) {
      const { error: notifErr } = await svc.from("notifications").insert(notifications);
      if (notifErr) console.warn("notifications insert failed", notifErr);
    }

    return new Response(
      JSON.stringify({ ok: true, expired: stale.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("expire-hire-requests error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
