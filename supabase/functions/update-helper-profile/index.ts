import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public endpoint — phone number is the authentication mechanism.
// Uses service-role key so RLS is bypassed server-side.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    const photo        = formData.get('photo') as File | null;

    if (!phone) return bad('phone is required');

    // Verify helper exists by phone
    const { data: helper, error: lookupErr } = await supabase
      .from('household_helpers')
      .select('id, photo_url')
      .eq('phone', phone)
      .neq('status', 'suspended')
      .maybeSingle();

    if (lookupErr || !helper) return bad('No helper found with that phone number', 404);

    const updates: Record<string, unknown> = {};

    // Bio
    if (bioRaw !== null) updates.bio = bioRaw || null;

    // Availability
    if (availRaw !== null) {
      try {
        updates.availability = JSON.parse(availRaw);
      } catch {
        updates.availability = [];
      }
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
      JSON.stringify({ success: true, photo_url: updates.photo_url ?? helper.photo_url }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[update-helper-profile] unhandled', err);
    return bad('Unexpected error', 500);
  }
});
