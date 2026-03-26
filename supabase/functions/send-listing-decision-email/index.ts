import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as {
      decision?: "approved" | "rejected";
      recipient_email?: string;
      listing_title?: string;
      note?: string | null;
    };

    const decision = body.decision;
    const to = body.recipient_email?.trim();
    const title = body.listing_title?.trim() || "Your Community listing";

    if (decision !== "approved" && decision !== "rejected") {
      return new Response(JSON.stringify({ error: "decision must be approved or rejected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!to) {
      return new Response(JSON.stringify({ error: "recipient_email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notifyFrom = Deno.env.get("LISTING_NOTIFY_EMAIL")?.trim() || "vano1app@gmail.com";
    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    const rawSite = Deno.env.get("SITE_URL")?.trim() || "https://vanojobs.com";
    const siteUrl = rawSite.replace(/^https?:\/\/www\.vanojobs\.com/i, "https://vanojobs.com").replace(/\/+$/, "");
    const from = Deno.env.get("RESEND_FROM")?.trim() || "VANO <onboarding@resend.dev>";

    const subject =
      decision === "approved"
        ? `[VANO] Your Community listing is live: ${title.slice(0, 60)}`
        : `[VANO] Update on your Community listing: ${title.slice(0, 60)}`;

    const text =
      decision === "approved"
        ? `Hi,\n\nGood news — your Community listing "${title}" has been approved and is now visible on the talent board.\n\n` +
          `Browse the board: ${siteUrl}/community\n\n` +
          `— The VANO team`
        : `Hi,\n\nThanks for submitting "${title}" to the VANO Community board.\n\n` +
          `We’re not able to approve this listing at this time.` +
          (body.note ? `\n\nNote from the team:\n${body.note}\n` : "\n") +
          `\nYou’re welcome to update your profile and submit again from your VANO profile.\n\n` +
          `— The VANO team`;

    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: notifyFrom,
          subject,
          text,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("Resend error:", res.status, errText);
        return new Response(JSON.stringify({ error: "Failed to send email" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("send-listing-decision-email: RESEND_API_KEY not set; email skipped.\n", text);
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
