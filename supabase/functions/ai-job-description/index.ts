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

    const { title, tags, location, workType } = await req.json();

    const prompt = `Generate a job listing for VANO, a freelance gig marketplace in Galway, Ireland.

Title: "${title}"
Tags: ${(tags || []).join(', ') || 'None yet'}
Location: "${location || 'Not specified'}"
Work Type: "${workType || 'on-site'}"

Return a polished description, a suggested hourly rate range, and up to 3 suggested tags.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You help businesses write professional gig listings for VANO in Galway, Ireland. Return structured output via the provided tool." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_job_listing",
            description: "Return a polished job description with suggested rate and tags.",
            parameters: {
              type: "object",
              properties: {
                description: { type: "string", description: "A professional 3-5 sentence job description" },
                suggestedRate: { type: "number", description: "Suggested hourly rate in EUR" },
                suggestedTags: { type: "array", items: { type: "string" }, description: "Up to 3 suggested category tags" },
              },
              required: ["description", "suggestedRate", "suggestedTags"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_job_listing" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: 'Rate limited, please try again shortly.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error('AI service error');
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fallback: try to parse from content
    const content = data.choices?.[0]?.message?.content || '';
    return new Response(JSON.stringify({ description: content, suggestedRate: 13, suggestedTags: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error("ai-job-description error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
