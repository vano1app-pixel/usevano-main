import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const { jobTitle, jobDescription, jobTags, studentSkills, studentBio } = await req.json();

    const prompt = `Write a short, friendly application message (3-5 sentences) for a student applying to a gig. Do NOT use a formal letter format. Just write the message text directly — no "Dear", no sign-off.

Job: "${jobTitle}"
Job Description: "${jobDescription || 'Not provided'}"
Job Tags: ${(jobTags || []).join(', ') || 'None'}

Student Skills: ${(studentSkills || []).join(', ') || 'Not specified'}
Student Bio: "${studentBio || 'Not provided'}"

Make it personalized, mention relevant matching skills, and keep it conversational and enthusiastic.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You write concise, personalized gig application messages for a freelance marketplace called VANO in Galway, Ireland." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: 'Rate limited, please try again shortly.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error('AI service error');
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ message: text.trim() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error("ai-cover-letter error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
