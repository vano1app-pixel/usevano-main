import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as { request_id?: string; post_id?: string };
    const requestId = body.request_id?.trim();
    const postId = body.post_id?.trim();

    if ((!requestId && !postId) || (requestId && postId)) {
      return new Response(JSON.stringify({ error: "Provide exactly one of request_id or post_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const notifyTo = Deno.env.get("LISTING_NOTIFY_EMAIL")?.trim() || "vano1app@gmail.com";
    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    const siteUrl = Deno.env.get("SITE_URL")?.trim() || "https://vanojobs.com";

    let subject = "[VANO] Community review";
    let text = "";

    if (requestId) {
      const { data: row, error: rowErr } = await admin
        .from("community_listing_requests")
        .select("id, user_id, applicant_email, category, title, description, status, created_at, image_url, rate_min, rate_max, rate_unit")
        .eq("id", requestId)
        .maybeSingle();

      if (rowErr || !row || row.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Request not found" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: prof } = await admin
        .from("profiles")
        .select("display_name, bio, user_type")
        .eq("user_id", row.user_id)
        .maybeSingle();

      const { data: sp } = await admin
        .from("student_profiles")
        .select("university, skills, hourly_rate, service_area, bio, tiktok_url, banner_url, typical_budget_min, typical_budget_max")
        .eq("user_id", row.user_id)
        .maybeSingle();

      const skills = Array.isArray(sp?.skills) ? (sp!.skills as string[]).join(", ") : "";
      text =
        `New freelancer Community listing (wizard) — pending approval\n\n` +
        `=== Listing ===\n` +
        `Request ID: ${row.id}\n` +
        `Status: ${row.status}\n` +
        `Category: ${row.category}\n` +
        `Title: ${row.title}\n` +
        `Applicant email: ${row.applicant_email || user.email || "(n/a)"}\n` +
        `Rates: ${row.rate_min ?? "?"}–${row.rate_max ?? "?"} (${row.rate_unit || "n/a"})\n` +
        `Image: ${row.image_url || "(none)"}\n\n` +
        `Description:\n${row.description}\n\n` +
        `=== Profile snapshot ===\n` +
        `Display name: ${prof?.display_name ?? "(n/a)"}\n` +
        `User type: ${prof?.user_type ?? "(n/a)"}\n` +
        `Profile bio: ${prof?.bio ?? "(n/a)"}\n` +
        `University: ${sp?.university ?? "(n/a)"}\n` +
        `Skills: ${skills || "(n/a)"}\n` +
        `Hourly rate: ${sp?.hourly_rate ?? "(n/a)"}\n` +
        `Service area: ${sp?.service_area ?? "(n/a)"}\n` +
        `Student bio: ${sp?.bio ?? "(n/a)"}\n` +
        `TikTok: ${sp?.tiktok_url ?? "(n/a)"}\n` +
        `Banner: ${sp?.banner_url ?? "(n/a)"}\n` +
        `Typical budget: ${sp?.typical_budget_min ?? "?"}–${sp?.typical_budget_max ?? "?"}\n\n` +
        `Approve in Dashboard → Table editor → community_listing_requests, or Mod → ${siteUrl}/admin\n` +
        `User ID: ${row.user_id}\n`;

      subject = `[VANO] Listing review (wizard) — ${row.title.slice(0, 50)}`;
    } else {
      const { data: post, error: postErr } = await admin
        .from("community_posts")
        .select("id, user_id, category, title, description, image_url, rate_min, rate_max, rate_unit, moderation_status, created_at")
        .eq("id", postId!)
        .maybeSingle();

      if (postErr || !post || post.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Post not found" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: prof } = await admin
        .from("profiles")
        .select("display_name, bio, user_type")
        .eq("user_id", post.user_id)
        .maybeSingle();

      const { data: sp } = await admin
        .from("student_profiles")
        .select("university, skills, hourly_rate, service_area, bio, tiktok_url, banner_url")
        .eq("user_id", post.user_id)
        .maybeSingle();

      const skills = Array.isArray(sp?.skills) ? (sp!.skills as string[]).join(", ") : "";
      text =
        `New Community post (quick create) — pending approval\n\n` +
        `=== Post ===\n` +
        `Post ID: ${post.id}\n` +
        `Moderation: ${post.moderation_status}\n` +
        `Category: ${post.category}\n` +
        `Title: ${post.title}\n` +
        `Rates: ${post.rate_min ?? "?"}–${post.rate_max ?? "?"} (${post.rate_unit || "n/a"})\n` +
        `Image: ${post.image_url || "(none)"}\n\n` +
        `Description:\n${post.description}\n\n` +
        `=== Profile snapshot ===\n` +
        `Email: ${user.email || "(n/a)"}\n` +
        `Display name: ${prof?.display_name ?? "(n/a)"}\n` +
        `University: ${sp?.university ?? "(n/a)"}\n` +
        `Skills: ${skills || "(n/a)"}\n` +
        `Hourly rate: ${sp?.hourly_rate ?? "(n/a)"}\n` +
        `Service area: ${sp?.service_area ?? "(n/a)"}\n` +
        `Banner: ${sp?.banner_url ?? "(n/a)"}\n\n` +
        `Set community_posts.moderation_status to 'approved' in Supabase Table Editor to go live.\n` +
        `${siteUrl}/community\n` +
        `User ID: ${post.user_id}\n`;

      subject = `[VANO] Post review — ${post.title.slice(0, 50)}`;
    }

    if (resendKey) {
      const from = Deno.env.get("RESEND_FROM")?.trim() || "VANO <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [notifyTo],
          subject,
          text,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("Resend error:", res.status, errText);
      }
    } else {
      console.warn("notify-community-listing-request: RESEND_API_KEY not set; email skipped. Body:\n", text);
    }

    return new Response(JSON.stringify({ ok: true, emailed: !!resendKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
