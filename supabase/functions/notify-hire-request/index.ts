import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Notifies the VANO team via email when a business submits a "Let Vano Handle It" hire request.
 *
 * Body: { description, category, budget_range, timeline, requester_email }
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

    // Verify caller
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
      description: string;
      category?: string;
      budget_range?: string;
      timeline?: string;
      requester_email?: string;
    };

    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    if (!resendKey) {
      console.warn("RESEND_API_KEY not set — skipping hire request email");
      return new Response(JSON.stringify({ ok: true, emailed: false, reason: "no_api_key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notifyTo = Deno.env.get("LISTING_NOTIFY_EMAIL")?.trim() || "vano1app@gmail.com";
    const from = Deno.env.get("RESEND_FROM")?.trim() || "VANO <onboarding@resend.dev>";
    const siteUrl = (Deno.env.get("SITE_URL")?.trim() || "https://vanojobs.com").replace(/\/+$/, "");

    const budgetMap: Record<string, string> = {
      under_100: "Under €100",
      "100_250": "€100–250",
      "250_500": "€250–500",
      "500_plus": "€500+",
      unsure: "Not sure",
    };
    const timelineMap: Record<string, string> = {
      this_week: "This week",
      "2_weeks": "2 weeks",
      "1_month": "1 month",
      flexible: "Flexible",
    };

    const subject = `[VANO] New hire request — ${body.category || "general"}`;
    const text =
      `New "Let Vano Handle It" request!\n\n` +
      `From: ${body.requester_email || user.email || "unknown"}\n` +
      `Category: ${body.category || "not specified"}\n` +
      `Budget: ${budgetMap[body.budget_range || ""] || body.budget_range || "not specified"}\n` +
      `Timeline: ${timelineMap[body.timeline || ""] || body.timeline || "not specified"}\n\n` +
      `Description:\n"${(body.description || "").slice(0, 500)}"\n\n` +
      `Admin dashboard: ${siteUrl}/admin\n` +
      `Reply to client: ${body.requester_email || user.email || ""}\n`;

    // 1) Team inbox — tells the Vano team a new brief came in.
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

    // 2) Hirer confirmation — tells the person who submitted that we
    //    actually received it. Previously they only got the WhatsApp
    //    auto-open; if their phone blocked the popup they had no
    //    signal the request landed. Silent-fail: if Resend can't
    //    reach them we still return ok=true for the team email.
    const hirerEmail = (body.requester_email || user.email || "").trim();
    let hirerEmailed = false;
    if (hirerEmail) {
      const hirerSubject = `We got your Vano brief — we'll be in touch within 24h`;
      const catLabel = body.category ? `${body.category}` : "freelancer";
      const hirerText =
        `Thanks — we've got your brief.\n\n` +
        `The Vano team is picking the best ${catLabel} for your project and will open a thread in your Messages within 24 hours (usually faster).\n\n` +
        `What we saw:\n` +
        `  Project: ${(body.description || "").slice(0, 300)}\n` +
        `  Budget: ${budgetMap[body.budget_range || ""] || body.budget_range || "not specified"}\n` +
        `  Timeline: ${timelineMap[body.timeline || ""] || body.timeline || "not specified"}\n\n` +
        `You can reply to this email or message us on WhatsApp — whichever is easier.\n\n` +
        `Your dashboard: ${siteUrl}/messages\n\n` +
        `— The Vano team\n`;

      try {
        const hirerRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [hirerEmail],
            reply_to: notifyTo,
            subject: hirerSubject,
            text: hirerText,
          }),
        });
        hirerEmailed = hirerRes.ok;
        if (!hirerEmailed) {
          console.warn(`Resend (hirer confirmation) ${hirerRes.status}: ${await hirerRes.text()}`);
        }
      } catch (e) {
        console.warn(`Resend (hirer confirmation) threw:`, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, emailed, hirerEmailed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-hire-request error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
