import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public endpoint for helper (student) signups.
// Accepts multipart/form-data with photo file + JSON fields.
// Inserts the helper row (or updates an existing pending application —
// duplicate phone/email submissions update in place rather than creating
// a second row).
//
// FREE-TO-JOIN, VERIFY-BEFORE-FIRST-JOB: applying still inserts the helper as
// status 'approved' + available (no payment, no manual review), but since the
// July 2026 first-job ID gate, dispatch and accept-job only offer/accept jobs
// for id_verified helpers — the free Stripe Identity check on /verify-helper
// (where the join form redirects on submit) is what actually goes live. This
// keeps the marketing claim "every helper is ID-verified before their first
// job" true. The ✓ Verified blue tick remains separate: student-email OTP
// (free) + the €2/month verified plan on top of the ID check — vano_verified
// in the DB. Verified helpers are offered jobs first, so the tick is the
// carrot; joining costs nothing.

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
    // Derive age from the DOB the form collects and gate on THAT — never trust
    // a client-supplied `age`. This endpoint is public (verify_jwt=false,
    // CORS *), so `if (age < 18)` on a client value let a scripted POST send
    // dob=2010-01-01&age=25 (or omit both → age null) and sail through. The
    // dob is required; a client `age` is ignored for the gate (and only used
    // as a cosmetic fallback for the badge when it agrees with a valid dob).
    const dobAge = ageFromDobStr(dob);
    if (dobAge === null) {
      return new Response(JSON.stringify({ error: 'Please enter your date of birth.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    if (dobAge < 18) {
      return new Response(JSON.stringify({ error: 'You must be 18 or over to join VANO.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const age = dobAge;

    // ── Duplicate guard ────────────────────────────────────────────────────
    // Look up an existing helper by email and by phone with TARGETED queries.
    // The old code selected the ENTIRE household_helpers table and scanned it
    // client-side, which silently breaks past PostgREST's 1,000-row cap — once
    // helper #1001 exists a re-application could miss the guard and create a
    // second live row. Phone is matched across the common formatting variants.
    const phoneDigitsRaw = phone.replace(/\D/g, '');
    const phoneVariants = new Set<string>([phone, phoneDigitsRaw]);
    if (phoneDigitsRaw.length >= 9) {
      const nat = phoneDigitsRaw.slice(-9);          // 899817111
      phoneVariants.add(nat);
      phoneVariants.add('0' + nat);                  // 0899817111
      phoneVariants.add('353' + nat);                // 353899817111
      phoneVariants.add('+353' + nat);               // +353899817111
    }
    const [emailHit, phoneHit] = await Promise.all([
      supabase.from('household_helpers').select('id, email, phone, status').eq('email', email).limit(1).maybeSingle(),
      supabase.from('household_helpers').select('id, email, phone, status').in('phone', [...phoneVariants]).limit(1).maybeSingle(),
    ]);
    const emailMatch = emailHit.data as { id: string; email: string | null; status: string } | null;
    const phoneMatch = phoneHit.data as { id: string; email: string | null; status: string } | null;
    const existing = emailMatch ?? phoneMatch ?? null;

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

    // Pending row → update in place (dedupe a double-tap / abandoned checkout).
    // BUT only take over on an EMAIL match. A phone-only match with a DIFFERENT
    // email must not overwrite the row's identity: that would let someone who
    // knows a stranger's number rewrite their pending row with the attacker's
    // email (then bind a magic-link sign-in to it) and inherit its state.
    let pendingExisting: { id: string } | null = null;
    if (existing && existing.status === 'pending') {
      if (emailMatch) {
        pendingExisting = { id: emailMatch.id };
      } else {
        // phone matched a pending row owned by a different email — conflict.
        return new Response(JSON.stringify({
          error: 'We already have an application with this phone number. WhatsApp us on +353 89 981 7111 and we will sort it out.',
        }), { status: 409, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

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
    // Free-to-join, but NOT instantly visible: the row is born approved yet
    // UNAVAILABLE with a pending_email_verify flag — the email OTP on
    // /verify-helper (the page the client lands on next) flips is_available
    // true and sends the welcome. That one free step is the spam gate: a junk
    // signup with a made-up email never inflates the public helper count and
    // never gets welcome messages. (Offers were already gated further behind
    // the free ID check — dispatch only texts id_verified helpers.)
    const helperFields = {
      name,
      email,
      phone,
      city,
      photo_url: publicUrl,
      categories,
      status: 'approved',
      is_available: false,
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
        // The spam gate: verify-student-email-otp sees this flag, flips
        // is_available true, clears it, and fires the welcome notification.
        pending_email_verify: true,
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

    // The "you're in" welcome (notify-helper-approved) is NOT sent here any
    // more — it fires from verify-student-email-otp the moment the email code
    // is confirmed, so welcomes only ever go to signups with a real inbox
    // (the spam gate). The applicant confirmation email below still goes out
    // immediately, since it's the message carrying the "confirm your email"
    // instruction itself.

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
      Thanks for joining VANO in <strong>${city}</strong> — you're approved. Two quick free steps
      on the next screen and jobs start coming through: <strong>confirm this email</strong> (we send
      a 6-digit code) and do the <strong>2-minute ID check</strong>. After that, the optional €2/month
      keeps the ✓ Verified tick on your name — verified helpers are offered jobs first.
    </p>
    <p style="margin:0 0 4px;color:#374151;font-size:14px;">Questions or in a hurry?</p>
    <a href="https://wa.me/353899817111" style="display:inline-block;background:#25d366;color:#fff;font-size:14px;font-weight:600;padding:12px 22px;border-radius:100px;text-decoration:none;margin-top:6px;">💬 WhatsApp us</a>
  </div>
</div>
</body></html>`,
            text: `Hi ${firstName}, you're approved as a VANO helper in ${city}. Two quick free steps and jobs start coming through: confirm this email (we send a 6-digit code) and do the 2-minute ID check. The optional €2/month keeps the ✓ Verified tick on your name — verified helpers are offered jobs first. Questions? WhatsApp +353 89 981 7111`,
          }),
        }).catch(() => {/* non-critical */});
      }
    }

    // Saved as 'approved' but not yet available. The client moves to
    // /verify-helper, where the email OTP flips them live (the spam gate),
    // the free ID check unlocks job offers, and the €2/month plan is optional.
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
