import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWebPush } from "../_shared/web-push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Message pools ──

const BUSINESS_CONTEXTUAL = {
  no_gigs: {
    id: "biz_no_gigs",
    title: "VANO",
    body: "Galway's best freelancers are waiting. Post your first gig 🚀",
    url: "/post-job?mode=self",
  },
  open_no_apps: {
    id: "biz_open_no_apps",
    title: "VANO",
    body: "Your gig is live — share it and watch the applications roll in 📬",
    url: "/jobs",
  },
  has_completed: {
    id: "biz_completed",
    title: "VANO",
    body: "Liked working with a freelancer? Hire them again in one tap 🔁",
    url: "/students",
  },
};

const BUSINESS_GENERAL = [
  { id: "biz_gen_1", title: "VANO", body: "Marketing feeling flat? Find someone who gets it on VANO 🎯", url: "/students" },
  { id: "biz_gen_2", title: "VANO", body: "Your website called. It wants a glow-up. Find a designer on VANO ✨", url: "/students" },
  { id: "biz_gen_3", title: "VANO", body: "Event coming up? Photographers and videographers are one tap away 📸", url: "/students" },
  { id: "biz_gen_4", title: "VANO", body: "Stop scrolling. Start hiring. VANO has the talent you need 💼", url: "/post-job?mode=self" },
];

const FREELANCER_CONTEXTUAL = {
  not_listed: {
    id: "fl_not_listed",
    title: "VANO",
    body: "You're invisible right now. Get listed and let businesses find you 👀",
    url: "/profile",
  },
  no_portfolio: {
    id: "fl_no_portfolio",
    title: "VANO",
    body: "No work samples = no messages. Add photos and watch your inbox grow 📷",
    url: "/profile",
  },
  incomplete_profile: {
    id: "fl_incomplete",
    title: "VANO",
    body: "Almost there — finish your profile and stand out from the crowd ⚡",
    url: "/profile",
  },
};

const FREELANCER_GENERAL = [
  { id: "fl_gen_1", title: "VANO", body: "New gigs just dropped. Go check the hiring board 🔥", url: "/jobs" },
  { id: "fl_gen_2", title: "VANO", body: "Your profile is live. Keep it fresh — update your skills and rates 💪", url: "/profile" },
  { id: "fl_gen_3", title: "VANO", body: "Galway businesses are hiring this week. Don't miss out 🇮🇪", url: "/jobs" },
  { id: "fl_gen_4", title: "VANO", body: "Someone might be looking for exactly what you do. Make sure they can find you 🎯", url: "/profile" },
];

const TWENTY_HOURS_MS = 20 * 60 * 60 * 1000;

interface PushMessage {
  id: string;
  title: string;
  body: string;
  url: string;
}

function pickMessage(
  applicable: PushMessage[],
  lastMessageId: string | null,
): PushMessage | null {
  if (applicable.length === 0) return null;
  // Filter out the last sent message to avoid repeats
  const filtered = applicable.filter((m) => m.id !== lastMessageId);
  const pool = filtered.length > 0 ? filtered : applicable;
  return pool[Math.floor(Math.random() * pool.length)];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all push subscriptions with notify_gigs enabled
    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth, last_engagement_push, last_engagement_message_id")
      .eq("notify_gigs", true);

    if (subsErr || !subs) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscriptions", detail: subsErr }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Deduplicate by user_id (one push per user)
    const userSubMap = new Map<string, typeof subs[0]>();
    for (const sub of subs) {
      const existing = userSubMap.get(sub.user_id);
      // Keep the most recently active one (or first seen)
      if (!existing) userSubMap.set(sub.user_id, sub);
    }

    const uniqueUserIds = [...userSubMap.keys()];
    if (uniqueUserIds.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: 0, message: "No subscribers" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch profiles for all users
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, user_type")
      .in("user_id", uniqueUserIds);

    const profileMap = new Map<string, { user_type: string }>();
    for (const p of profiles || []) {
      profileMap.set(p.user_id, { user_type: p.user_type });
    }

    // Fetch student profiles
    const { data: studentProfiles } = await supabase
      .from("student_profiles")
      .select("user_id, community_board_status, bio, skills, university")
      .in("user_id", uniqueUserIds);

    const studentMap = new Map<string, typeof studentProfiles extends (infer T)[] | null ? T : never>();
    for (const sp of studentProfiles || []) {
      studentMap.set(sp.user_id, sp);
    }

    // Fetch portfolio item counts per user
    const { data: portfolioCounts } = await supabase
      .rpc("count_portfolio_items_by_users", { user_ids: uniqueUserIds })
      .select("*");

    // Fallback: if RPC doesn't exist, just treat as 0
    const portfolioMap = new Map<string, number>();
    if (portfolioCounts) {
      for (const row of portfolioCounts) {
        portfolioMap.set(row.user_id, row.count);
      }
    }

    // Fetch job counts for business users
    const businessUserIds = uniqueUserIds.filter(
      (uid) => profileMap.get(uid)?.user_type === "business",
    );
    const jobCountMap = new Map<string, { open: number; completed: number; with_apps: number }>();

    if (businessUserIds.length > 0) {
      const { data: jobs } = await supabase
        .from("jobs")
        .select("posted_by, status")
        .in("posted_by", businessUserIds);

      for (const j of jobs || []) {
        const entry = jobCountMap.get(j.posted_by) || { open: 0, completed: 0, with_apps: 0 };
        if (j.status === "open") entry.open++;
        if (j.status === "completed") entry.completed++;
        jobCountMap.set(j.posted_by, entry);
      }
    }

    let sent = 0;
    let skipped = 0;

    for (const [userId, sub] of userSubMap) {
      // Skip if sent within last 20 hours
      if (sub.last_engagement_push) {
        const lastPush = new Date(sub.last_engagement_push).getTime();
        if (Date.now() - lastPush < TWENTY_HOURS_MS) {
          skipped++;
          continue;
        }
      }

      const profile = profileMap.get(userId);
      if (!profile) { skipped++; continue; }

      let message: PushMessage | null = null;
      const lastMsgId = sub.last_engagement_message_id;

      if (profile.user_type === "business") {
        const jobCounts = jobCountMap.get(userId);
        const applicable: PushMessage[] = [];

        if (!jobCounts || (jobCounts.open === 0 && jobCounts.completed === 0)) {
          applicable.push(BUSINESS_CONTEXTUAL.no_gigs);
        } else if (jobCounts.open > 0) {
          applicable.push(BUSINESS_CONTEXTUAL.open_no_apps);
        }
        if (jobCounts && jobCounts.completed > 0) {
          applicable.push(BUSINESS_CONTEXTUAL.has_completed);
        }

        // Always add general pool
        applicable.push(...BUSINESS_GENERAL);
        message = pickMessage(applicable, lastMsgId);
      } else {
        // Freelancer
        const sp = studentMap.get(userId);
        const applicable: PushMessage[] = [];

        if (!sp || sp.community_board_status !== "approved") {
          applicable.push(FREELANCER_CONTEXTUAL.not_listed);
        } else {
          const portfolioCount = portfolioMap.get(userId) || 0;
          if (portfolioCount === 0) {
            applicable.push(FREELANCER_CONTEXTUAL.no_portfolio);
          }
          if (!sp.bio || !sp.university || (sp.skills || []).length < 3) {
            applicable.push(FREELANCER_CONTEXTUAL.incomplete_profile);
          }
        }

        applicable.push(...FREELANCER_GENERAL);
        message = pickMessage(applicable, lastMsgId);
      }

      if (!message) { skipped++; continue; }

      const pushPayload = JSON.stringify({
        title: message.title,
        body: message.body,
        url: message.url,
        tag: `engagement-${message.id}`,
      });

      const success = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        pushPayload,
        vapidPublicKey,
        vapidPrivateKey,
        "mailto:hello@usevano.com",
      );

      if (success) {
        sent++;
        await supabase
          .from("push_subscriptions")
          .update({
            last_engagement_push: new Date().toISOString(),
            last_engagement_message_id: message.id,
          })
          .eq("id", sub.id);
      } else {
        // Remove dead subscription
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }

    return new Response(
      JSON.stringify({
        sent,
        skipped,
        total: userSubMap.size,
        message: `Sent ${sent} engagement push(es), skipped ${skipped}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-engagement-push error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
