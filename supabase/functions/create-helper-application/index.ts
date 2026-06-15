import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public endpoint for helper (student) signups.
// Accepts multipart/form-data with photo file + JSON fields.
// Inserts the helper row (or updates an existing pending application —
// duplicate phone/email submissions update in place rather than creating
// a second row). Joining is free: there is no payment step — the helper
// goes live the moment an admin approves the application.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const formData = await req.formData();

    const name       = (formData.get('name')       as string | null)?.trim();
    const email      = (formData.get('email')      as string | null)?.trim().toLowerCase();
    const phone      = (formData.get('phone')      as string | null)?.trim();
    const city       = (formData.get('city')       as string | null)?.trim();
    const ageRaw     = (formData.get('age')        as string | null)?.trim();
    const bioRaw     = (formData.get('bio')        as string | null)?.trim();
    const categories = JSON.parse((formData.get('categories') as string | null) ?? '[]') as string[];
    const tutorSubjects = JSON.parse((formData.get('tutor_subjects') as string | null) ?? '[]') as string[];
    const tutorLevels   = JSON.parse((formData.get('tutor_levels')   as string | null) ?? '[]') as string[];
    const photo      = formData.get('photo') as File | null;

    if (!name || !email || !phone || !city || categories.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (!photo) {
      return new Response(JSON.stringify({ error: 'Photo is required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const age = ageRaw ? parseInt(ageRaw, 10) : null;

    // ── Duplicate guard ────────────────────────────────────────────────────
    // Match an existing helper by email or by phone (digits-only, last 9 —
    // catches "+353 89..." vs "089..." formatting differences). Approved
    // helpers are sent to their account page; pending applications are
    // updated in place so a double-tap or abandoned checkout never creates
    // a second row.
    const phoneDigits = phone.replace(/\D/g, '');
    const last9 = phoneDigits.slice(-9);
    const { data: allHelpers } = await supabase
      .from('household_helpers')
      .select('id, email, phone, status');
    const existing = (allHelpers ?? []).find((h: { email: string | null; phone: string | null }) =>
      (h.email && h.email.toLowerCase() === email) ||
      (h.phone && last9.length === 9 && h.phone.replace(/\D/g, '').endsWith(last9)),
    ) as { id: string; status: string } | undefined;

    if (existing && existing.status === 'approved') {
      return new Response(JSON.stringify({
        error: "You're already a VANO helper! Manage your profile from the account page, or WhatsApp us if something's wrong.",
      }), { status: 409, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (existing && (existing.status === 'suspended' || existing.status === 'rejected')) {
      return new Response(JSON.stringify({
        error: 'We already have an application with these details. WhatsApp us on +353 89 981 7111 and we will sort it out.',
      }), { status: 409, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const pendingExisting = existing ?? null; // status 'pending' → update in place

    // Upload photo to helper-photos bucket
    const ext  = photo.name.split('.').pop() ?? 'jpg';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('helper-photos')
      .upload(path, photo, { upsert: false, contentType: photo.type });

    if (uploadError) {
      console.error('[create-helper-application] photo upload failed', uploadError);
      return new Response(JSON.stringify({ error: 'Photo upload failed' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: { publicUrl } } = supabase.storage
      .from('helper-photos')
      .getPublicUrl(path);

    // Insert helper row (no user_id — they don't need a Supabase auth
    // account), or refresh the existing pending application in place.
    const helperFields = {
      name,
      email,
      phone,
      city,
      photo_url: publicUrl,
      categories,
      status: 'pending',
      ...(age !== null && !isNaN(age) ? { age } : {}),
      ...(bioRaw ? { bio: bioRaw } : {}),
      ...(categories.includes('tutoring') && (tutorSubjects.length > 0 || tutorLevels.length > 0)
        ? { tutor_subjects: tutorSubjects, tutor_levels: tutorLevels }
        : {}),
    };

    const { error: saveError } = pendingExisting
      ? await supabase.from('household_helpers').update(helperFields).eq('id', pendingExisting.id)
      : await supabase.from('household_helpers').insert({ user_id: null, ...helperFields });

    if (saveError) {
      console.error('[create-helper-application] save failed', saveError);
      await supabase.storage.from('helper-photos').remove([path]);
      return new Response(JSON.stringify({ error: 'Could not save application' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Notify admin via WhatsApp — fire and forget. Skipped on resubmission
    // so a retried signup doesn't ping the admin twice.
    if (!pendingExisting) {
      fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_student',
          name, phone, email, city, categories,
          tutor_subjects: tutorSubjects,
          tutor_levels: tutorLevels,
          photo_url: publicUrl,
        }),
      }).catch(() => {/* non-critical */});
    }

    // Confirmation email to the applicant — applying into silence loses
    // people. Fire and forget; new applications only.
    if (!pendingExisting) {
      const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
      const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
      if (resendKey) {
        const firstName = name.split(' ')[0];
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: resendFrom,
            to: [email],
            subject: `Application received 🎓 — VANO`,
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">Application received 🎓</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${firstName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      Thanks for applying to be a VANO helper in <strong>${city}</strong>. We review every application
      personally — you'll hear back <strong>within 24 hours</strong>, usually much faster.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      Joining VANO is <strong>completely free</strong> — there's nothing to pay. Once you're approved,
      your profile goes live and we'll start sending you jobs.
    </p>
    <p style="margin:0 0 4px;color:#374151;font-size:14px;">Questions or in a hurry?</p>
    <a href="https://wa.me/353899817111" style="display:inline-block;background:#25d366;color:#fff;font-size:14px;font-weight:600;padding:12px 22px;border-radius:100px;text-decoration:none;margin-top:6px;">💬 WhatsApp us</a>
  </div>
</div>
</body></html>`,
            text: `Hi ${firstName}, thanks for applying to be a VANO helper in ${city}. We review every application personally — you'll hear back within 24 hours. Joining is completely free — there's nothing to pay. Questions? WhatsApp +353 89 981 7111`,
          }),
        }).catch(() => {/* non-critical */});
      }
    }

    // Joining is free — no payment step. The application is saved as
    // 'pending'; the helper goes live the moment an admin approves it.
    // (No checkout_url is returned, so the client shows the welcome state.)
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[create-helper-application] unhandled', err);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
