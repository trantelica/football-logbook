/**
 * AI Enrichment Edge Function
 *
 * Accepts current play candidate context and a list of unresolved field names.
 * Calls Lovable AI Gateway to propose values for unresolved fields only.
 * Returns a proposal object keyed by field name.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { candidate, unresolvedFields, fieldHints } = await req.json();

    if (
      !candidate ||
      !Array.isArray(unresolvedFields) ||
      unresolvedFields.length === 0
    ) {
      return new Response(
        JSON.stringify({ proposal: {} }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build a focused system prompt
    const systemPrompt = `You are a football play-by-play data assistant. Given partial play data, suggest values for the specified unresolved fields only. Return a JSON object mapping field names to suggested values. Only include fields from the unresolved list. Use realistic football values. Do not invent field names.

Field hints (allowed values where applicable):
${JSON.stringify(fieldHints ?? {}, null, 2)}`;

    const userPrompt = `Current play data (partial):
${JSON.stringify(candidate, null, 2)}

Unresolved fields needing suggestions: ${JSON.stringify(unresolvedFields)}

Return ONLY a JSON object with suggested values for the unresolved fields. Example: {"hash": "L", "result": "Rush"}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "suggest_fields",
                description:
                  "Return suggested values for unresolved play fields",
                parameters: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "object",
                      description:
                        "Map of field name to suggested value. Only include fields from the unresolved list.",
                      additionalProperties: true,
                    },
                  },
                  required: ["suggestions"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "suggest_fields" },
          },
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();

    // Extract structured output from tool call
    let proposal: Record<string, unknown> = {};
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        proposal = parsed.suggestions ?? {};
      } catch {
        console.error("Failed to parse AI tool call arguments");
      }
    }

    // Safety: strip any fields not in the unresolved list
    const unresolvedSet = new Set(unresolvedFields);
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(proposal)) {
      if (unresolvedSet.has(k) && v !== null && v !== undefined && v !== "") {
        filtered[k] = v;
      }
    }

    return new Response(
      JSON.stringify({ proposal: filtered }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-enrich error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
