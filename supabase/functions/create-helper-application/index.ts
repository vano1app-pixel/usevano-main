import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public endpoint for helper (student) signups.
// Accepts multipart/form-data with photo file + JSON fields.
// Inserts the helper row, then redirects to a Stripe subscription
// checkout for the €2/month platform membership.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

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
        ...(age !== null && !isNaN(age) ? { age } : {}),
        ...(bioRaw ? { bio: bioRaw } : {}),
        ...(categories.includes('tutoring') && (tutorSubjects.length > 0 || tutorLevels.length > 0)
          ? { tutor_subjects: tutorSubjects, tutor_levels: tutorLevels }
          : {}),
      });

    if (insertError) {
      console.error('[create-helper-application] insert failed', insertError);
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

    // Create Stripe subscription checkout for €2/month membership
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) {
      // Fallback: return success without checkout (Stripe not configured)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const origin =
      req.headers.get('origin') ||
      Deno.env.get('SITE_URL') ||
      'https://vanojobs.com';

    const checkoutParams: Record<string, string> = {
      mode: 'subscription',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': '200',
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': 'VANO Helper Membership',
      'line_items[0][price_data][product_data][description]': 'Monthly membership — be listed on VANO and receive bookings',
      'line_items[0][quantity]': '1',
      success_url: `${origin}/join?welcome=1&name=${encodeURIComponent(name)}`,
      cancel_url:  `${origin}/join`,
      customer_email: email,
      'metadata[helper_name]': name,
      'metadata[helper_phone]': phone,
      'metadata[helper_city]': city,
    };

    const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formEncode(checkoutParams),
    });

    if (!stripeResp.ok) {
      const text = await stripeResp.text();
      console.error('[create-helper-application] stripe error', stripeResp.status, text);
      // Application saved — return success even if Stripe fails
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const session = await stripeResp.json() as { id: string; url: string };

    return new Response(JSON.stringify({ success: true, checkout_url: session.url }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[create-helper-application] unhandled', err);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
