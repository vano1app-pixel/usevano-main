import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public endpoint for helper (student) signups.
// Accepts multipart/form-data with photo file + JSON fields.
// Inserts the helper row (or updates an existing pending application —
// duplicate phone/email submissions update in place rather than creating
// a second row).
//
// FREE-TO-JOIN: applying puts the helper live immediately (status 'approved',
// available). The ✓ Verified blue tick is earned separately on /verify-helper:
// student-email OTP + Stripe Identity check (both free) + the €2/month
// verified plan — vano_verified in the DB. Verified helpers are offered jobs
// first, so the tick is the carrot; joining costs nothing.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Store phones in a canonical shape so the phone-gated lookup
// (find-helper-by-phone) and dispatch SMS/WhatsApp both match reliably.
// Real bug this fixes: helpers were signing up as "83 341 0456" / "851689402"
// (a bare 9-digit mobile with no leading 0) and could then never load their
// account by phone. Strips punctuation, keeps a genuine + country code, and
// restores the leading 0 on a bare Irish mobile (8x…). Non-Irish/odd inputs
// pass through digit-cleaned rather than being mangled.
function normalizeStoredPhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (!cleaned) return undefined;
  if (cleaned.startsWith('+')) return cleaned;                 // explicit international
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2); // 00353… → +353…
  if (/^353\d{9}$/.test(cleaned)) return '0' + cleaned.slice(3); // 353 8x… → 0 8x…
  if (/^0\d{9}$/.test(cleaned)) return cleaned;                // already 0-prefixed
  if (/^8[0-9]\d{7}$/.test(cleaned)) return '0' + cleaned;     // bare Irish mobile → add leading 0
  return cleaned;
}

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
    const phone      = normalizeStoredPhone((formData.get('phone') as string | null)?.trim());
    const city       = (formData.get('city')       as string | null)?.trim();
    const ageRaw     = (formData.get('age')        as string | null)?.trim();
    const bioRaw     = (formData.get('bio')        as string | null)?.trim();
    const categories = JSON.parse((formData.get('categories') as string | null) ?? '[]') as string[];
    const tutorSubjects = JSON.parse((formData.get('tutor_subjects') as string | null) ?? '[]') as string[];
    const tutorLevels   = JSON.parse((formData.get('tutor_levels')   as string | null) ?? '[]') as string[];
    const photo      = formData.get('photo') as File | null;

    // Fields added by the redesigned multi-step join form. Structured ones the
    // platform already reads (areas_served, availability) go to their columns;
    // the rest are kept together in application_data (see the migration).
    const dob          = (formData.get('dob')           as string | null)?.trim() || null;
    const college      = (formData.get('college')       as string | null)?.trim() || null;
    const course       = (formData.get('course')        as string | null)?.trim() || null;
    const year         = (formData.get('year')          as string | null)?.trim() || null;
    const transport    = (formData.get('transport')     as string | null)?.trim() || null;
    const studentEmail = (formData.get('student_email') as string | null)?.trim().toLowerCase() || null;
    const areas        = JSON.parse((formData.get('areas')        as string | null) ?? '[]') as string[];
    const availability = JSON.parse((formData.get('availability') as string | null) ?? '[]') as string[];
    const rightToWork   = (formData.get('right_to_work')  as string | null) === 'true';
    const consentVerify = (formData.get('consent_verify') as string | null) === 'true';
    const agreeTerms    = (formData.get('agree_terms')    as string | null) === 'true';
    // Opt-in to recurring "House Autopilot" clients (regular weekly/monthly work).
    const autopilotOptIn = (formData.get('autopilot') as string | null) === 'true';

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

    // Age: prefer an explicit `age`, else derive whole years from the `dob` the
    // join form now collects — so the profile age badge populates from one
    // field. 18+ is a hard requirement (right-to-work, adults-only tutoring),
    // enforced here as the real gate; the client checkbox/date bounds are only
    // the first line.
    function ageFromDobStr(v: string | null): number | null {
      if (!v) return null;
      const d = new Date(v);
      if (isNaN(d.getTime())) return null;
      const now = new Date();
      let a = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
      return a;
    }
    const parsedAge = ageRaw ? parseInt(ageRaw, 10) : null;
    const age = (parsedAge !== null && !isNaN(parsedAge)) ? parsedAge : ageFromDobStr(dob);
    if (age !== null && age < 18) {
      return new Response(JSON.stringify({ error: 'You must be 18 or over to join VANO.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

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
    // Free-to-join: live + available from the moment they apply.
    const helperFields = {
      name,
      email,
      phone,
      city,
      photo_url: publicUrl,
      categories,
      status: 'approved',
      is_available: true,
      autopilot_opt_in: autopilotOptIn,
      ...(age !== null && !isNaN(age) ? { age } : {}),
      ...(bioRaw ? { bio: bioRaw } : {}),
      ...(categories.includes('tutoring') && (tutorSubjects.length > 0 || tutorLevels.length > 0)
        ? { tutor_subjects: tutorSubjects, tutor_levels: tutorLevels }
        : {}),
      ...(areas.length > 0 ? { areas_served: areas } : {}),
      ...(availability.length > 0 ? { availability } : {}),
      application_data: {
        dob,
        college,
        course,
        year,
        transport,
        student_email: studentEmail,
        // Consent snapshot at apply time. The live verification state lives in
        // the dedicated columns (student_email_verified, id_verified, signup_paid).
        consents: { right_to_work: rightToWork, verify: consentVerify, terms: agreeTerms },
        submitted_at: new Date().toISOString(),
      },
    };

    const saved = pendingExisting
      ? await supabase.from('household_helpers').update(helperFields).eq('id', pendingExisting.id).select('id').maybeSingle()
      : await supabase.from('household_helpers').insert({ user_id: null, ...helperFields }).select('id').maybeSingle();
    const saveError = saved.error;
    const helperId = pendingExisting?.id ?? (saved.data as { id: string } | null)?.id ?? null;

    if (saveError) {
      console.error('[create-helper-application] save failed', saveError);
      await supabase.storage.from('helper-photos').remove([path]);
      return new Response(JSON.stringify({ error: 'Could not save application' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Free-to-join: they're approved the moment the row lands — send the
    // "you're in" WhatsApp/email (dashboard, alerts, payout steps) right away.
    if (!pendingExisting && helperId) {
      fetch(`${supabaseUrl}/functions/v1/notify-helper-approved`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ helper_id: helperId }),
      }).catch(() => {/* non-critical */});
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
          college,
          student_email: studentEmail,
          areas,
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
      Thanks for joining VANO in <strong>${city}</strong> — <strong>you're live already</strong> and
      jobs near you can start coming through. Next, earn your <strong>✓ Verified tick</strong> on the
      next screen: confirm your student email and do the 2-minute ID check (both free), then €2/month
      keeps the tick on your name. Verified helpers are offered jobs first.
    </p>
    <p style="margin:0 0 4px;color:#374151;font-size:14px;">Questions or in a hurry?</p>
    <a href="https://wa.me/353899817111" style="display:inline-block;background:#25d366;color:#fff;font-size:14px;font-weight:600;padding:12px 22px;border-radius:100px;text-decoration:none;margin-top:6px;">💬 WhatsApp us</a>
  </div>
</div>
</body></html>`,
            text: `Hi ${firstName}, you're live as a VANO helper in ${city} — jobs near you can start coming through. Next: earn your ✓ Verified tick — confirm your student email and do the 2-minute ID check (both free), then €2/month keeps the tick on your name. Verified helpers get offered jobs first. Questions? WhatsApp +353 89 981 7111`,
          }),
        }).catch(() => {/* non-critical */});
      }
    }

    // Saved as 'approved' — they're live. The client moves to /verify-helper,
    // where the ✓ tick is earned: email OTP + ID check (free) + €2/month plan.
    return new Response(JSON.stringify({ success: true, helper_id: helperId }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[create-helper-application] unhandled', err);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
