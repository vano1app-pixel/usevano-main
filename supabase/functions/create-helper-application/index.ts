import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public endpoint for helper (student) signups.
// Accepts multipart/form-data with photo file + JSON fields.
// Uses service-role key to upload photo and insert the helper row —
// no Supabase auth account required, no email confirmation delay.

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

    // Insert helper row (no user_id — they don't need a Supabase auth account)
    const { error: insertError } = await supabase
      .from('household_helpers')
      .insert({
        user_id: null,
        name,
        email,
        phone,
        city,
        photo_url: publicUrl,
        categories,
        status: 'pending',
        ...(categories.includes('tutoring') && (tutorSubjects.length > 0 || tutorLevels.length > 0)
          ? { tutor_subjects: tutorSubjects, tutor_levels: tutorLevels }
          : {}),
      });

    if (insertError) {
      console.error('[create-helper-application] insert failed', insertError);
      // Clean up uploaded photo
      await supabase.storage.from('helper-photos').remove([path]);
      return new Response(JSON.stringify({ error: 'Could not save application' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Notify admin via WhatsApp — fire and forget
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
