import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasAccountAccess } from "../_shared/accountToken.ts";

// Helper self-service edits: bio, availability, categories, photo, and
// changing the phone number itself (new_phone). Uses the service-role key so
// RLS is bypassed server-side.
//
// AUTH (phone-gate hardening, July 2026): the phone field LOCATES the row but
// no longer authorises the edit by itself. The caller must also present ONE of
//   - account_token — minted by student-account-otp after a texted 6-digit
//     code (/student-account, the phone-gated editor), or
//   - a signed-in Supabase session whose user is linked to this helper row
//     (the dashboard's profile sheet sends its access token).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SLUG_RE = /^[a-z0-9-]{1,40}$/;

function parseSlugArray(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s): s is string => typeof s === 'string' && SLUG_RE.test(s))
      .slice(0, 80);
  } catch {
    return [];
  }
}

function phoneVariants(raw: string): string[] {
  const phone = raw.replace(/[\s\-().]/g, '');
  const variants = new Set<string>([raw, phone]);
  if (phone.startsWith('+353')) {
    variants.add('0' + phone.slice(4));
    variants.add(phone.slice(1));
  } else if (phone.startsWith('353')) {
    variants.add('+' + phone);
    variants.add('0' + phone.slice(3));
  } else if (phone.startsWith('0')) {
    variants.add('+353' + phone.slice(1));
    variants.add('353' + phone.slice(1));
  }
  return [...variants];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const bad = (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const formData = await req.formData();
    const phone        = (formData.get('phone')        as string | null)?.trim();
    const bioRaw       = (formData.get('bio')          as string | null)?.trim();
    const availRaw     = (formData.get('availability') as string | null);
    const catsRaw      = (formData.get('categories')   as string | null);
    const newPhoneRaw  = (formData.get('new_phone')    as string | null)?.trim();
    const newEmailRaw  = (formData.get('new_email')    as string | null)?.trim().toLowerCase();
    const handleRaw    = (formData.get('payment_handle') as string | null);
    const photo        = formData.get('photo') as File | null;

    if (!phone) return bad('phone is required');

    // Verify helper exists by phone — tolerate country-code formatting
    // differences, falling back to a digits-only comparison.
    let { data: helper, error: lookupErr } = await supabase
      .from('household_helpers')
      .select('id, photo_url, email, user_id')
      .in('phone', phoneVariants(phone))
      .neq('status', 'suspended')
      .limit(1)
      .maybeSingle();

    if (!helper && !lookupErr) {
      const last9 = phone.replace(/\D/g, '').slice(-9);
      if (last9.length === 9) {
        const { data: rows, error: listErr } = await supabase
          .from('household_helpers')
          .select('id, phone, photo_url, email, user_id')
          .neq('status', 'suspended');
        if (listErr) {
          lookupErr = listErr;
        } else {
          const hit = (rows ?? []).find((r: { phone: string | null }) =>
            (r.phone ?? '').replace(/\D/g, '').endsWith(last9));
          if (hit) helper = hit as { id: string; photo_url: string; email: string | null; user_id: string | null };
        }
      }
    }

    if (lookupErr || !helper) return bad('No helper found with that phone number', 404);

    // Prove the caller IS this helper (see header comment). Try the account
    // session token first (phone-gated /student-account), then a linked auth
    // session (the dashboard sends its access token; the bare anon key fails
    // getUser and correctly falls through to the 401).
    const accountToken = (formData.get('account_token') as string | null) ?? undefined;
    let authorized = await hasAccountAccess(accountToken, helper.id);
    if (!authorized) {
      const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
      if (jwt) {
        const { data: userData } = await supabase.auth.getUser(jwt);
        const uid = userData?.user?.id ?? null;
        authorized = !!uid && uid === (helper as { user_id?: string | null }).user_id;
      }
    }
    if (!authorized) return bad('Your secure session expired — verify your number again on the account page.', 401);

    const updates: Record<string, unknown> = {};

    // Bio
    if (bioRaw !== null && bioRaw !== undefined) updates.bio = bioRaw || null;

    // Availability
    if (availRaw !== null) {
      updates.availability = parseSlugArray(availRaw) ?? [];
    }

    // Categories — the services a helper offers; only clean slugs accepted
    if (catsRaw !== null) {
      updates.categories = parseSlugArray(catsRaw) ?? [];
    }

    // Phone change
    if (newPhoneRaw) {
      const digits = newPhoneRaw.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) return bad('Invalid new phone number');
      // Reject a number another helper already uses. The phone IS the auth
      // credential here, so a collision would let either person load and edit
      // the other's row at the phone gate. Check across formatting variants,
      // excluding this helper's own row.
      const { data: clash } = await supabase
        .from('household_helpers')
        .select('id')
        .in('phone', phoneVariants(newPhoneRaw))
        .neq('id', helper.id)
        .limit(1)
        .maybeSingle();
      if (clash) return bad('That number is already registered to another helper.');
      updates.phone = newPhoneRaw;
    }

    // Email add/change — a different address is unconfirmed, so it drops
    // student_email_verified; the OTP flow on /verify-helper re-earns it.
    let emailUnverified = false;
    if (newEmailRaw) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmailRaw) || newEmailRaw.length > 254) {
        return bad('Invalid email address');
      }
      updates.email = newEmailRaw;
      const current = ((helper as { email?: string | null }).email ?? '').toLowerCase();
      // Only a DIFFERENT address drops the verified flag; re-saving the same
      // one keeps it. We report which happened so the client doesn't blank the
      // blue tick on a no-op re-save (it can't see the stored email itself).
      if (newEmailRaw !== current) { updates.student_email_verified = false; emailUnverified = true; }
    }

    // Payment handle — how customers pay the helper directly (direct-pay
    // model: helpers keep 100%, Vano only charges its booking fee). Usually
    // a Revolut tag like "@seanog1". Empty string clears it.
    if (handleRaw !== null) {
      const cleaned = handleRaw.trim().replace(/\s+/g, ' ').slice(0, 60);
      updates.payment_handle = cleaned || null;
    }

    // Photo upload
    if (photo) {
      const ext  = photo.name.split('.').pop() ?? 'jpg';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('helper-photos')
        .upload(path, photo, { upsert: false, contentType: photo.type });

      if (uploadErr) {
        console.error('[update-helper-profile] photo upload failed', uploadErr);
        return bad('Photo upload failed', 500);
      }

      const { data: { publicUrl } } = supabase.storage.from('helper-photos').getPublicUrl(path);
      updates.photo_url = publicUrl;
    }

    if (Object.keys(updates).length === 0) return bad('Nothing to update');

    const { error: updateErr } = await supabase
      .from('household_helpers')
      .update(updates)
      .eq('id', helper.id);

    if (updateErr) {
      console.error('[update-helper-profile] update failed', updateErr);
      return bad('Update failed', 500);
    }

    return new Response(
      JSON.stringify({
        success: true,
        photo_url: updates.photo_url ?? helper.photo_url,
        phone: updates.phone ?? undefined,
        // true only when the email actually changed (verified flag cleared).
        email_unverified: emailUnverified,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[update-helper-profile] unhandled', err);
    return bad('Unexpected error', 500);
  }
});
