import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public endpoint — phone number is the authentication mechanism.
// Uses service-role key so RLS is bypassed server-side.
// Handles every helper self-service edit: bio, availability, categories,
// photo, and changing the phone number itself (new_phone).

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
      .slice(0, 30);
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
    const photo        = formData.get('photo') as File | null;

    if (!phone) return bad('phone is required');

    // Verify helper exists by phone — tolerate country-code formatting
    // differences, falling back to a digits-only comparison.
    let { data: helper, error: lookupErr } = await supabase
      .from('household_helpers')
      .select('id, photo_url')
      .in('phone', phoneVariants(phone))
      .neq('status', 'suspended')
      .limit(1)
      .maybeSingle();

    if (!helper && !lookupErr) {
      const last9 = phone.replace(/\D/g, '').slice(-9);
      if (last9.length === 9) {
        const { data: rows, error: listErr } = await supabase
          .from('household_helpers')
          .select('id, phone, photo_url')
          .neq('status', 'suspended');
        if (listErr) {
          lookupErr = listErr;
        } else {
          const hit = (rows ?? []).find((r: { phone: string | null }) =>
            (r.phone ?? '').replace(/\D/g, '').endsWith(last9));
          if (hit) helper = hit as { id: string; photo_url: string };
        }
      }
    }

    if (lookupErr || !helper) return bad('No helper found with that phone number', 404);

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
      updates.phone = newPhoneRaw;
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
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[update-helper-profile] unhandled', err);
    return bad('Unexpected error', 500);
  }
});
