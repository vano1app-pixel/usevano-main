import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), { status: 500, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify caller
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
    if (callerId !== user_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch student data
    const [{ data: studentProfile }, { data: preferences }, { data: recentApps }] = await Promise.all([
      supabase.from('student_profiles').select('skills, hourly_rate, university, bio').eq('user_id', user_id).maybeSingle(),
      supabase.from('freelancer_preferences').select('preferred_tags, preferred_work_type, min_budget, max_budget').eq('user_id', user_id).maybeSingle(),
      supabase.from('job_applications').select('job_id').eq('student_id', user_id).order('applied_at', { ascending: false }).limit(20),
    ]);

    // Fetch open jobs not already applied to
    const appliedJobIds = (recentApps || []).map((a: any) => a.job_id);
    let jobQuery = supabase.from('jobs').select('id, title, description, location, hourly_rate, fixed_price, payment_type, shift_date, tags, work_type').eq('status', 'open').order('created_at', { ascending: false }).limit(50);

    const { data: openJobs } = await jobQuery;
    const availableJobs = (openJobs || []).filter((j: any) => !appliedJobIds.includes(j.id));

    if (availableJobs.length === 0) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build AI prompt
    const studentInfo = {
      skills: studentProfile?.skills || [],
      hourly_rate: studentProfile?.hourly_rate,
      university: studentProfile?.university,
      bio: studentProfile?.bio,
      preferred_tags: preferences?.preferred_tags || [],
      preferred_work_type: preferences?.preferred_work_type,
      min_budget: preferences?.min_budget,
      max_budget: preferences?.max_budget,
    };

    const jobsList = availableJobs.map((j: any) => ({
      id: j.id,
      title: j.title,
      description: j.description?.slice(0, 100),
      location: j.location,
      hourly_rate: j.hourly_rate,
      fixed_price: j.fixed_price,
      payment_type: j.payment_type,
      shift_date: j.shift_date,
      tags: j.tags,
      work_type: j.work_type,
    }));

    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        messages: [
          {
            role: "system",
            content: "You are a job matching assistant. Given a student profile and available jobs, return the top 6 best matching jobs ranked by relevance. Consider skills overlap, pay preferences (jobs may be fixed-price projects or legacy hourly), work type, and tags."
          },
          {
            role: "user",
            content: `Student profile: ${JSON.stringify(studentInfo)}\n\nAvailable jobs: ${JSON.stringify(jobsList)}\n\nReturn the top 6 matches.`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_matches",
            description: "Return the ranked job matches",
            parameters: {
              type: "object",
              properties: {
                matches: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      job_id: { type: "string" },
                      match_score: { type: "number", description: "0-100 match percentage" },
                      reason: { type: "string", description: "One sentence explaining the match" }
                    },
                    required: ["job_id", "match_score", "reason"],
                    additionalProperties: false
                  }
                }
              },
              required: ["matches"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "return_matches" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited, try again later' }), { status: 429, headers: corsHeaders });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Credits exhausted' }), { status: 402, headers: corsHeaders });
      }
      console.error("AI error:", aiResponse.status, await aiResponse.text());
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let aiMatches: any[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        aiMatches = parsed.matches || [];
      } catch { /* fallback empty */ }
    }

    // Enrich with job data
    const jobMap = new Map(availableJobs.map((j: any) => [j.id, j]));
    const enriched = aiMatches
      .filter((m: any) => jobMap.has(m.job_id))
      .map((m: any) => {
        const job = jobMap.get(m.job_id);
        return {
          id: job.id,
          title: job.title,
          location: job.location,
          hourly_rate: job.hourly_rate,
          fixed_price: job.fixed_price,
          payment_type: job.payment_type,
          shift_date: job.shift_date,
          tags: job.tags || [],
          match_score: Math.min(100, Math.max(0, Math.round(m.match_score))),
          match_reason: m.reason,
        };
      });

    return new Response(JSON.stringify({ matches: enriched }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error("smart-match error:", err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
