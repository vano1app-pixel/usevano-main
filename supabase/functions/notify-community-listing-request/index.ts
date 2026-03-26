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

    const { request_id } = await req.json() as { request_id?: string };
    if (!request_id) {
      return new Response(JSON.stringify({ error: "request_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: row, error: rowErr } = await admin
      .from("community_listing_requests")
      .select("id, user_id, applicant_email, category, title, description, status, created_at")
      .eq("id", request_id)
      .maybeSingle();

    if (rowErr || !row || row.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notifyTo = Deno.env.get("LISTING_NOTIFY_EMAIL")?.trim() || "vano1app@gmail.com";
    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    const siteUrl = Deno.env.get("SITE_URL")?.trim() || "https://vanojobs.com";

    const text =
      `New Community listing request (pending your approval)\n\n` +
      `Request ID: ${row.id}\n` +
      `User ID: ${row.user_id}\n` +
      `Email: ${row.applicant_email || "(not provided)"}\n` +
      `Category: ${row.category}\n` +
      `Title: ${row.title}\n\n` +
      `Description:\n${row.description}\n\n` +
      `Open Mod Dashboard → Community requests to approve or reject.\n` +
      `${siteUrl}/admin\n`;

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
          subject: `[VANO] Community listing to review — ${row.title.slice(0, 60)}`,
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
