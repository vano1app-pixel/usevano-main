import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Sends an email to the VANO admin when a business↔student message is exchanged.
 * Uses the same Resend API already configured for community listing notifications.
 *
 * Body: { sender_name, recipient_name, sender_type, recipient_type, message_preview, freelancer_phone? }
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

    // Verify the caller is a real user
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
      sender_name: string;
      recipient_name: string;
      sender_type: string;
      recipient_type: string;
      message_preview: string;
      freelancer_phone?: string;
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

    const isBizToStudent = body.sender_type === "business" && body.recipient_type === "student";
    const direction = isBizToStudent ? "messaged" : "replied to";

    const subject = `[VANO] ${body.sender_name} ${direction} ${body.recipient_name}`;
    const phoneLine = body.freelancer_phone?.trim()
      ? `Freelancer phone: ${body.freelancer_phone}`
      : "Freelancer phone: (not set)";

    const text =
      `${body.sender_name} (${body.sender_type}) ${direction} ${body.recipient_name} (${body.recipient_type})\n\n` +
      `Message:\n"${body.message_preview.slice(0, 300)}"\n\n` +
      `${phoneLine}\n\n` +
      `View messages: ${siteUrl}/messages\n` +
      `Admin: ${siteUrl}/admin\n`;

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
    console.error("notify-admin-message error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
