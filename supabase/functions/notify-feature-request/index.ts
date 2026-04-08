import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Sends an email to the VANO admin when a user submits a feature request.
 * Body: { user_name, message }
 */
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

    const body = await req.json() as {
      user_name: string;
      message: string;
    };

    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    if (!resendKey) {
      console.warn("RESEND_API_KEY not set — skipping admin email");
      return new Response(JSON.stringify({ ok: true, emailed: false, reason: "no_api_key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notifyTo = Deno.env.get("LISTING_NOTIFY_EMAIL")?.trim() || "vano1app@gmail.com";
    const from = Deno.env.get("RESEND_FROM")?.trim() || "VANO <onboarding@resend.dev>";
    const siteUrl = (Deno.env.get("SITE_URL")?.trim() || "https://vanojobs.com").replace(/\/+$/, "");

    const subject = `[VANO] New feature request from ${body.user_name}`;
    const text =
      `${body.user_name} submitted a feature request:\n\n` +
      `"${body.message.slice(0, 500)}"\n\n` +
      `View all requests: ${siteUrl}/admin\n`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [notifyTo], subject, text }),
    });

    const emailed = res.ok;
    if (!emailed) {
      const errText = await res.text();
      console.warn(`Resend error ${res.status}: ${errText}`);
    }

    return new Response(JSON.stringify({ ok: true, emailed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-feature-request error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
