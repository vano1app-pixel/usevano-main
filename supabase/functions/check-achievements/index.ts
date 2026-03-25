import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const callerId = claimsData.claims.sub;
    const body = await req.json();
    const user_id = body?.user_id;
    if (!user_id || typeof user_id !== 'string' || !UUID_REGEX.test(user_id)) {
      return new Response(JSON.stringify({ error: 'Valid user_id (UUID) required' }), { status: 400, headers: corsHeaders });
    }

    if (callerId !== user_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Count accepted applications (completed shifts)
    const { data: apps } = await supabase
      .from('job_applications')
      .select('id, job_id, applied_at, confirmed_at, jobs(shift_date)')
      .eq('student_id', user_id)
      .eq('status', 'accepted');

    const completedShifts = (apps || []).filter((a: any) => {
      return a.jobs && new Date(a.jobs.shift_date) < new Date();
    }).length;

    // Get reviews received
    const { data: reviewsReceived } = await supabase
      .from('reviews')
      .select('rating, created_at')
      .eq('reviewee_id', user_id)
      .order('created_at', { ascending: false });

    const avgRating = reviewsReceived && reviewsReceived.length > 0
      ? reviewsReceived.reduce((s: number, r: any) => s + r.rating, 0) / reviewsReceived.length
      : 0;

    // Get reviews given
    const { data: reviewsGiven } = await supabase
      .from('reviews')
      .select('id')
      .eq('reviewer_id', user_id);

    const reviewsGivenCount = reviewsGiven?.length || 0;

    // Check for 5-star streak (3+ consecutive 5-star reviews received)
    let fiveStarStreak = false;
    if (reviewsReceived && reviewsReceived.length >= 3) {
      let streak = 0;
      for (const r of reviewsReceived) {
        if (r.rating === 5) {
          streak++;
          if (streak >= 3) { fiveStarStreak = true; break; }
        } else {
          streak = 0;
        }
      }
    }

    // Check quick responder (confirmed_at within 1 hour of applied_at, 3+ times)
    let quickResponses = 0;
    (apps || []).forEach((a: any) => {
      if (a.confirmed_at && a.applied_at) {
        const diff = new Date(a.confirmed_at).getTime() - new Date(a.applied_at).getTime();
        if (diff <= 3600000) quickResponses++;
      }
    });

    // Define badges
    const badges = [
      { key: 'first_shift', label: 'First Shift', condition: completedShifts >= 1 },
      { key: 'five_shifts', label: '5 Shifts Complete', condition: completedShifts >= 5 },
      { key: 'ten_shifts', label: '10 Shifts Complete', condition: completedShifts >= 10 },
      { key: 'twenty_shifts', label: '20 Shifts Complete', condition: completedShifts >= 20 },
      { key: 'fifty_shifts', label: '50 Shifts Complete', condition: completedShifts >= 50 },
      { key: 'five_star', label: '5-Star Rated', condition: avgRating >= 4.8 && reviewsReceived && reviewsReceived.length >= 3 },
      { key: 'reliable', label: 'Reliable Worker', condition: completedShifts >= 5 && avgRating >= 4.0 },
      { key: 'first_review', label: 'First Review', condition: reviewsGivenCount >= 1 },
      { key: 'five_star_streak', label: '5-Star Streak', condition: fiveStarStreak },
      { key: 'quick_responder', label: 'Quick Responder', condition: quickResponses >= 3 },
      { key: 'community_star', label: 'Community Star', condition: reviewsGivenCount >= 10 },
    ];

    const earned = badges.filter((b) => b.condition);

    for (const badge of earned) {
      await supabase.from('student_achievements').upsert(
        { user_id, badge_key: badge.key, badge_label: badge.label },
        { onConflict: 'user_id,badge_key' }
      );
    }

    return new Response(JSON.stringify({ earned: earned.length, total: completedShifts }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error("check-achievements error:", err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
