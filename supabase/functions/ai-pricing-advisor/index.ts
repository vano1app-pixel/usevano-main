import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) {
    return new Response(JSON.stringify({ error: 'Forbidden origin' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    const { title, tags, location, workType, skills, context } = await req.json();

    const isJobContext = context === 'job';
    const prompt = isJobContext
      ? `Suggest a competitive hourly rate range in EUR for a gig in Galway, Ireland.

Job Title: "${title || 'Not specified'}"
Tags: ${(tags || []).join(', ') || 'General'}
Location: "${location || 'Galway'}"
Work Type: "${workType || 'on-site'}"

Consider Irish minimum wage (€12.70/hr in 2025) and typical freelance rates for students. Return a min and max rate with brief reasoning.`
      : `Suggest a competitive hourly rate range in EUR for a freelancer in Galway, Ireland.

Skills: ${(skills || []).join(', ') || 'General'}

Consider Irish minimum wage (€12.70/hr in 2025) and typical freelance rates for students. Return a min and max rate with brief reasoning.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        messages: [
          { role: "system", content: "You are a pricing advisor for VANO, a freelance gig marketplace in Galway, Ireland. Return structured output via the provided tool." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_rate",
            description: "Return suggested hourly rate range with reasoning.",
            parameters: {
              type: "object",
              properties: {
                suggestedMin: { type: "number", description: "Minimum suggested rate in EUR" },
                suggestedMax: { type: "number", description: "Maximum suggested rate in EUR" },
                reasoning: { type: "string", description: "Brief 1-2 sentence explanation" },
              },
              required: ["suggestedMin", "suggestedMax", "reasoning"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_rate" } },
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

    return new Response(JSON.stringify({ suggestedMin: 12.70, suggestedMax: 18, reasoning: 'Based on Irish minimum wage and typical student freelance rates.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error("ai-pricing-advisor error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
