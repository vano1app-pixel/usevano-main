import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWebPush } from "../_shared/web-push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub;

    const body = await req.json();
    const job_id = body?.job_id;
    if (!job_id || typeof job_id !== "string" || !UUID_REGEX.test(job_id)) {
      return new Response(JSON.stringify({ error: "Valid job_id (UUID) required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.posted_by !== callerId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobTags = (job.tags || []).map((t: string) => t.toLowerCase());
    if (jobTags.length === 0) {
      return new Response(
        JSON.stringify({ matched: 0, message: "No tags on job" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: students } = await supabase
      .from("student_profiles")
      .select("user_id, skills")
      .eq("is_available", true);

    if (!students || students.length === 0) {
      return new Response(
        JSON.stringify({ matched: 0, message: "No available students" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const matchedStudents = students.filter((s) => {
      const studentSkills = (s.skills || []).map((sk: string) => sk.toLowerCase());
      return studentSkills.some((skill: string) => jobTags.includes(skill));
    });

    if (matchedStudents.length === 0) {
      return new Response(
        JSON.stringify({ matched: 0, message: "No matching students" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create in-app notifications
    const notifications = matchedStudents.map((s) => ({
      user_id: s.user_id,
      title: "New shift matches your skills!",
      message: `"${job.title}" in ${job.location} — €${job.hourly_rate}/hr`,
      job_id: job.id,
    }));

    const { error: insertError } = await supabase
      .from("notifications")
      .insert(notifications);

    if (insertError) {
      console.error("Failed to insert notifications:", insertError);
    }

    // Notify admin emails
    const ADMIN_EMAILS = ["vano1app@gmail.com", "ayushpuri1239@gmail.com"];
    const adminUserIds: string[] = [];
    try {
      const { data: { users: allUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (allUsers) {
        for (const u of allUsers) {
          if (ADMIN_EMAILS.includes(u.email?.toLowerCase() ?? "")) {
            adminUserIds.push(u.id);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch admin users:", e);
    }

    if (adminUserIds.length > 0) {
      const adminNotifications = adminUserIds
        .filter((id) => id !== callerId) // don't notify the poster if they're an admin
        .map((id) => ({
          user_id: id,
          title: "New gig posted",
          message: `"${job.title}" in ${job.location} — €${job.hourly_rate ?? job.fixed_price ?? 0}`,
          job_id: job.id,
        }));

      if (adminNotifications.length > 0) {
        await supabase.from("notifications").insert(adminNotifications);
      }
    }

    // Send web push notifications
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    let pushSent = 0;

    if (vapidPublicKey && vapidPrivateKey) {
      const matchedUserIds = matchedStudents.map((s) => s.user_id);
      const allPushTargets = [...new Set([...matchedUserIds, ...adminUserIds])];
      const { data: pushSubs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .in("user_id", allPushTargets)
        .eq("notify_gigs", true);

      if (pushSubs && pushSubs.length > 0) {
        const pushPayload = JSON.stringify({
          title: "New gig matches your skills! 🎯",
          body: `"${job.title}" in ${job.location} — €${job.hourly_rate}/hr`,
          url: `/jobs/${job.id}`,
          tag: `job-${job.id}`,
        });

        const pushPromises = pushSubs.map(async (sub) => {
          const success = await sendWebPush(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            pushPayload,
            vapidPublicKey,
            vapidPrivateKey,
            "mailto:hello@usevano.com",
          );
          if (success) pushSent++;
          else {
            // Remove invalid subscription
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
        });

        await Promise.allSettled(pushPromises);
      }
    }

    return new Response(
      JSON.stringify({
        matched: matchedStudents.length,
        pushSent,
        message: `Notified ${matchedStudents.length} student(s), ${pushSent} push notification(s) sent`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("notify-matched-students error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
