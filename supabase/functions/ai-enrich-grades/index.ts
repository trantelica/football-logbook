/**
 * AI Grade Enrichment Edge Function (Pass 3 only)
 *
 * Narrow advisory fallback for Pass 3 blocking-grade narration the
 * deterministic parser could not fully resolve. Coach-initiated only.
 *
 * Hard rules (server-side defensive filter):
 *   - Returns ONLY canonical grade* fields (11 keys).
 *   - Values must be integers in [-3, 3].
 *   - Drops alias/role/non-grade keys.
 *   - Drops fields the deterministic parser already resolved (caller reconciles
 *     conflicts; server still filters to avoid silent overwrite).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRADE_FIELDS = [
  "gradeLT", "gradeLG", "gradeC", "gradeRG", "gradeRT",
  "gradeX", "gradeY", "grade1", "grade2", "grade3", "grade4",
] as const;
const GRADE_SET = new Set<string>(GRADE_FIELDS);

const GRADE_MIN = -3;
const GRADE_MAX = 3;

function buildSchema(allowed: string[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const g of allowed) {
    properties[g] = {
      type: "integer",
      minimum: GRADE_MIN,
      maximum: GRADE_MAX,
      description: `Grade for canonical field ${g}. Omit if not confidently stated by the coach.`,
    };
  }
  return {
    type: "object",
    description:
      "Canonical Pass 3 grade patch. Only include fields you can confidently infer from the coach's narration. Omit any field you are unsure about.",
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
      narrationText,
      parserPatch,
      unresolvedFields,
      positionAliases,
      positionLabels,
    } = await req.json();

    const MAX_INPUT_LEN = 4000;
    if (
      !narrationText ||
      typeof narrationText !== "string" ||
      narrationText.trim() === ""
    ) {
      return new Response(
        JSON.stringify({ patch: {}, error: "No narration text provided", errorCategory: "bad_request" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (narrationText.length > MAX_INPUT_LEN) {
      return new Response(
        JSON.stringify({ patch: {}, error: `Narration text too long (max ${MAX_INPUT_LEN} chars)`, errorCategory: "bad_request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("ai-enrich-grades: LOVABLE_API_KEY missing");
      return new Response(
        JSON.stringify({ error: "AI service unavailable", errorCategory: "auth" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const unresolved = Array.isArray(unresolvedFields)
      ? (unresolvedFields as string[]).filter((f) => GRADE_SET.has(f))
      : [];

    // If nothing is unresolved, short-circuit — nothing for AI to do.
    if (unresolved.length === 0) {
      return new Response(
        JSON.stringify({ patch: {} }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aliases = (positionAliases ?? {}) as Record<string, string>;
    const labels = (positionLabels ?? {}) as Record<string, string>;

    // Map grade fields to position aliases (grade* shares the pos* slot).
    const GRADE_TO_POS: Record<string, string> = {
      gradeLT: "posLT", gradeLG: "posLG", gradeC: "posC", gradeRG: "posRG", gradeRT: "posRT",
      gradeX: "posX", gradeY: "posY",
      grade1: "pos1", grade2: "pos2", grade3: "pos3", grade4: "pos4",
    };
    const fieldLines = unresolved
      .map((g) => {
        const lbl = labels[g] ?? g.replace(/^grade/, "");
        const posKey = GRADE_TO_POS[g];
        const alias = posKey ? aliases[posKey] : undefined;
        return alias ? `  ${g}  (${lbl} / alias "${alias}")` : `  ${g}  (${lbl})`;
      })
      .join("\n");

    const parserLines = Object.entries((parserPatch ?? {}) as Record<string, unknown>)
      .filter(([k]) => GRADE_SET.has(k))
      .map(([k, v]) => `  ${k} = ${v}`)
      .join("\n");

    const systemPrompt = `You are a football blocking-grade assistant. The coach has dictated Pass 3 blocking grades. A deterministic parser has already extracted what it could. Your job is to infer ONLY the remaining canonical grade* fields the parser missed, from the coach's narration.

Canonical grade fields you may propose (use ONLY these keys — never aliases, never position labels):
${fieldLines}

Hard rules:
- Return ONLY canonical grade* keys with integer values in [${GRADE_MIN}, ${GRADE_MAX}].
- NEVER return position labels (LT, RG, X, Y) or aliases (F, H, Z) as keys — map to canonical grade* yourself.
- OMIT any field you cannot confidently infer from the narration. Empty result is valid.
- NEVER re-emit fields the deterministic parser already resolved (listed below) — the coach owns those.
- Group phrases like "offensive line", "O line", "OL" expand to gradeLT, gradeLG, gradeC, gradeRG, gradeRT.
- Exception clauses ("except", "but", "other than") override the prior group's value for the named position only.
- Independent later clauses ("Y should get a three", "the F should get a two") propose only those named fields.
- "2 back" / "the H" / "two back" → grade2. "F" / "three back" → grade3 (when alias map says so).
- NEVER invent grades for positions the coach did not mention.
- NEVER include explanations inside the patch.
`;

    const userPrompt = `Coach's narration:
"${narrationText.trim()}"

Deterministic parser already resolved (do NOT re-emit these — the parser is authoritative):
${parserLines || "  (none)"}

Unresolved grade fields you MAY propose values for:
${fieldLines}

Position aliases (canonical pos slot → alias):
${JSON.stringify(aliases)}

Return ONLY canonical grade* keys with integer values in [${GRADE_MIN}, ${GRADE_MAX}]. Omit everything else.`;

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
                name: "propose_grades",
                description:
                  "Propose canonical Pass 3 grade values inferred from the coach's narration. Omit fields you cannot confidently infer.",
                parameters: buildSchema(unresolved),
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "propose_grades" },
          },
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI rate limited. Try again shortly.", errorCategory: "rate_limited" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage.", errorCategory: "credits_exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI service error", errorCategory: "gateway_error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();

    let raw: Record<string, unknown> = {};
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
      } catch (e) {
        console.error("Failed to parse AI tool call arguments", e);
      }
    } else {
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) {
        try {
          const m = content.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
          }
        } catch (e) {
          console.error("Fallback JSON-in-content parse failed", e);
        }
      }
      if (Object.keys(raw).length === 0) {
        return new Response(
          JSON.stringify({ patch: {}, error: "AI returned no structured grade output.", errorCategory: "model_empty" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Server-side defensive filter: canonical grade key + integer in range,
    // and never re-emit a parser-resolved field.
    const parserSet = new Set(
      Object.keys((parserPatch ?? {}) as Record<string, unknown>).filter((k) =>
        GRADE_SET.has(k),
      ),
    );
    const patch: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!GRADE_SET.has(k)) continue;
      if (parserSet.has(k)) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isInteger(n)) continue;
      if (n < GRADE_MIN || n > GRADE_MAX) continue;
      patch[k] = n;
    }

    return new Response(
      JSON.stringify({ patch }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-enrich-grades error:", e);
    return new Response(
      JSON.stringify({ error: "Unexpected error", errorCategory: "server_exception" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
