/**
 * AI Enrichment Edge Function
 *
 * Accepts a grounded context packet:
 * - observationText: coach dictation
 * - deterministicPatch: already-parsed values
 * - unresolvedFields: only AI-eligible fields
 * - fieldHints: enum values, governed lookup values, phraseology hints
 * - locationMapping: Hudl-centered yardline model constraints
 *
 * Calls Lovable AI Gateway to propose values grounded in observation text.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Build a typed JSON-schema object for the suggest_fields tool.
 * Each unresolved field becomes a top-level optional property whose shape is
 * derived from its hint (governed → {value,matchType}; enum → string with enum;
 * integer → integer; default → string).
 *
 * Without concrete properties, Gemini returns an empty object — see prior debug.
 */
function buildSuggestFieldsSchema(
  unresolvedFields: string[],
  fieldHints: Record<string, unknown>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const name of unresolvedFields) {
    const hint = (fieldHints[name] ?? {}) as {
      type?: string;
      label?: string;
      allowedValues?: string[];
      governedValues?: string[];
    };
    const label = hint.label ?? name;

    if (hint.governedValues && hint.governedValues.length > 0) {
      // Governed lookup field — { value, matchType }
      properties[name] = {
        type: "object",
        description: `Governed lookup value for ${label}. Use exact governed value when possible; otherwise propose candidate_new.`,
        properties: {
          value: { type: "string", description: "Canonical governed value or new candidate string" },
          matchType: {
            type: "string",
            enum: ["exact", "fuzzy", "candidate_new"],
            description: "exact = matches governedValues; fuzzy = clear single match; candidate_new = unseen value",
          },
        },
        required: ["value", "matchType"],
        additionalProperties: false,
      };
    } else if (hint.allowedValues && hint.allowedValues.length > 0) {
      properties[name] = {
        type: "string",
        enum: hint.allowedValues,
        description: `Enum value for ${label}`,
      };
    } else if (hint.type === "integer") {
      properties[name] = {
        type: "integer",
        description: `Integer value for ${label}`,
      };
    } else {
      properties[name] = {
        type: "string",
        description: `Value for ${label}`,
      };
    }
  }

  return {
    type: "object",
    description: "Object containing only the fields you can confidently infer from the coach's observation. Omit any field you cannot infer.",
    properties,
    additionalProperties: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      observationText,
      deterministicPatch,
      candidate,
      unresolvedFields,
      fieldHints,
      locationMapping,
      activeSection,
    } = await req.json();

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

    // Gate: no observation text = no AI call
    if (!observationText || typeof observationText !== "string" || observationText.trim() === "") {
      return new Response(
        JSON.stringify({ proposal: {}, error: "No observation text provided — AI enrichment requires narrative context" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build location mapping instructions if provided
    let locationInstructions = "";
    if (locationMapping) {
      locationInstructions = `
Location Model (Hudl-centered, authoritative):
- Field size: ${locationMapping.fieldSize} yards
- Yardline range: ${locationMapping.validYardLnRange.min} to ${locationMapping.validYardLnRange.max}
- Convention: ${locationMapping.convention}
- Midfield: ${locationMapping.midfield}
${locationMapping.predictionActive ? `- IMPORTANT: Prediction engine already resolved yardLn to ${locationMapping.predictedYardLn}. Do NOT propose yardLn.` : "- Prediction engine did not resolve yardLn — you may propose if observation supports it."}
- If "our" or "their" context is missing and cannot be inferred, OMIT yardLn entirely.
- Do NOT invent your own location interpretation model.`;
    }

    // Slice A: section context note for prompt scoping. The client is the
    // authoritative gate; this is informational only.
    const sectionInstruction = typeof activeSection === "string" && activeSection
      ? `\nActive Pass 1 section: ${activeSection}. Only propose values for fields listed in the unresolved fields list (already scoped to this section's owned fields).`
      : "";

    // Build a focused system prompt
    const systemPrompt = `You are a football play-by-play data assistant. A coach has dictated observations about a play. A deterministic parser has already extracted some structured fields. Your job is to infer values ONLY for the remaining unresolved fields based on what the coach said.

Rules:
- Only suggest values for fields listed in the unresolved fields list.
- Base your suggestions on what the coach actually said in the observation text.
- Do not guess values that have no basis in the observation text.
- Do not invent field names.
- For fields with allowedValues (fixed enums), propose only values from that list.
- Use phraseologyHints to understand how coaches commonly express each concept.
- If you cannot confidently infer a field from the observation, OMIT it.
- NEVER return literal placeholder strings such as "None", "N/A", "no motion", "no penalty", "unknown", "—", or empty strings to indicate absence. If a value is absent or unclear, OMIT the field entirely.

Governed lookup fields (fields with governedValues):
For these fields, follow this priority cascade:
1. EXACT MATCH: If the spoken phrase matches a governed value (case-insensitive), return { "value": "<canonical value>", "matchType": "exact" }.
2. FUZZY/ALIAS MATCH: If no exact match but a single governed value clearly matches (e.g., "gun trips" → "Shotgun Trips Right"), return { "value": "<canonical value>", "matchType": "fuzzy" }. If multiple could match, OMIT.
3. CANDIDATE NEW: If no governed value matches but the coach clearly names a specific value (e.g., "purple formation"), return { "value": "<raw candidate>", "matchType": "candidate_new" }.
4. If uncertain, OMIT the field entirely.

For NON-governed fields (no governedValues in hints), return a plain value (string or number).
${locationInstructions}${sectionInstruction}

Field hints (types, allowed/governed values, phraseology):
${JSON.stringify(fieldHints ?? {}, null, 2)}`;

    const userPrompt = `Coach's observation:
"${observationText.trim()}"

Fields already resolved by deterministic parser:
${JSON.stringify(deterministicPatch ?? {}, null, 2)}

Current play state (all resolved fields):
${JSON.stringify(candidate, null, 2)}

Unresolved fields needing suggestions: ${JSON.stringify(unresolvedFields)}

Return ONLY a JSON object with values you can confidently infer from the coach's observation. For governed lookup fields (those with governedValues in hints), return { "value": "...", "matchType": "exact"|"fuzzy"|"candidate_new" }. For other fields, return plain values. Omit fields you cannot infer. Example: {"hash": "L", "result": "Rush", "offForm": {"value": "Shotgun Trips", "matchType": "exact"}}`;

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
                  "Return suggested values for unresolved play fields based on the coach's observation. Omit any field you cannot confidently infer.",
                parameters: buildSuggestFieldsSchema(unresolvedFields, fieldHints ?? {}),
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
        // New schema returns fields directly; legacy schema wrapped them under `suggestions`.
        if (parsed && typeof parsed === "object" && parsed.suggestions && typeof parsed.suggestions === "object") {
          proposal = parsed.suggestions as Record<string, unknown>;
        } else if (parsed && typeof parsed === "object") {
          proposal = parsed as Record<string, unknown>;
        }
      } catch {
        console.error("Failed to parse AI tool call arguments");
      }
    }

    // Safety: strip any fields not in the unresolved list
    // Preserve governed field objects { value, matchType } — do NOT flatten
    const unresolvedSet = new Set(unresolvedFields);
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(proposal)) {
      if (!unresolvedSet.has(k)) continue;
      // Governed field shape: { value: "...", matchType: "..." } — pass through as-is
      if (v && typeof v === "object" && !Array.isArray(v) && "value" in (v as Record<string, unknown>)) {
        const obj = v as Record<string, unknown>;
        const val = obj.value;
        if (val !== null && val !== undefined && val !== "") {
          filtered[k] = { value: val, matchType: obj.matchType ?? "exact" };
        }
      } else if (v !== null && v !== undefined && v !== "") {
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
