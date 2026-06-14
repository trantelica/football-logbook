/**
 * AI Personnel Enrichment Edge Function (Pass 2 only)
 *
 * Narrow fallback for Pass 2 personnel narration the deterministic parser
 * could not fully resolve, including surgical edits over already-filled
 * carry-forward state.
 *
 * Inputs:
 *   - observationText: coach dictation
 *   - currentPersonnel: snapshot of canonical pos* fields in the active slot
 *   - deterministicPatch: parser-extracted pos* values (may be empty)
 *   - positionAliases: { pos3: "F", pos4: "Z", ... } (canonical → alias)
 *   - roster: [{ jersey, name? }] — informational only; AI must not invent
 *     entries and existing off-roster governance still gates commit
 *   - canonicalFields: the 11 allowed pos* keys
 *
 * Output:
 *   { patch: { posX: <int 0..99>, ... } }
 *
 * Server enforces:
 *   - canonical pos* keys only (drops aliases, role phrases, foreign keys)
 *   - integer 0..99 (drops everything else)
 *   - never returns explanations / role labels in patch
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PERSONNEL_POSITIONS = [
  "posLT", "posLG", "posC", "posRG", "posRT",
  "posX", "posY", "pos1", "pos2", "pos3", "pos4",
] as const;
const CANONICAL_SET = new Set<string>(PERSONNEL_POSITIONS);

function buildSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const p of PERSONNEL_POSITIONS) {
    properties[p] = {
      type: "integer",
      minimum: 0,
      maximum: 99,
      description: `Jersey number assigned to canonical slot ${p}. Omit if you cannot confidently infer this slot from the coach's text.`,
    };
  }
  return {
    type: "object",
    description:
      "Canonical Pass 2 personnel patch. Only include slots you can confidently infer from the coach's observation. Omit any slot you are unsure about.",
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
      currentPersonnel,
      deterministicPatch,
      positionAliases,
      roster,
    } = await req.json();

    if (
      !observationText ||
      typeof observationText !== "string" ||
      observationText.trim() === ""
    ) {
      return new Response(
        JSON.stringify({ patch: {}, error: "No observation text provided", errorCategory: "bad_request" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const MAX_INPUT_LEN = 4000;
    if (observationText.length > MAX_INPUT_LEN) {
      return new Response(
        JSON.stringify({ patch: {}, error: `Observation text too long (max ${MAX_INPUT_LEN} chars)`, errorCategory: "bad_request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("ai-enrich-personnel: LOVABLE_API_KEY missing");
      return new Response(
        JSON.stringify({ error: "AI service unavailable", errorCategory: "auth" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aliases = (positionAliases ?? {}) as Record<string, string>;
    const aliasLines = PERSONNEL_POSITIONS
      .map((p) => {
        const a = aliases[p];
        return a ? `  ${p} ← alias "${a}"` : `  ${p}`;
      })
      .join("\n");

    const rosterArr = Array.isArray(roster) ? roster : [];
    const rosterLines = rosterArr
      .filter((r) => r && typeof r.jersey === "number")
      .map((r) => (r.name ? `  #${r.jersey} ${r.name}` : `  #${r.jersey}`))
      .join("\n");

    const systemPrompt = `You are a football personnel-assignment assistant. The coach has dictated a Pass 2 personnel update. A deterministic parser has already handled what it could. Your job is to infer ONLY the remaining canonical position-slot assignments the parser missed.

Canonical slots (use ONLY these field keys — never aliases, never role phrases like "center" or "left tackle"):
${aliasLines}

Hard rules:
- Return ONLY canonical pos* field keys with integer jersey values (0..99).
- NEVER return alias keys (e.g. "F", "Z") — map them to canonical (pos3, pos4) yourself.
- NEVER return role phrases (e.g. "center", "LT", "left guard") as keys — map to canonical (posC, posLT, posLG) yourself.
- OMIT any slot you cannot confidently infer. Empty result is valid.
- Surgical edits over filled state are allowed: if the coach moves a jersey, propose the new slot value. Do NOT touch slots the coach didn't mention.
- For "swap A and B": only propose the swapped values when both jerseys are unambiguously located in currentPersonnel. Otherwise OMIT.
- Player names: only map a name to a jersey when EXACTLY ONE roster entry matches the name. Ambiguous or missing → OMIT.
- Spoken jersey numbers may be proposed even if not on the roster — existing governance handles off-roster at commit time.
- NEVER invent jersey numbers. NEVER mutate the roster. NEVER propose explanations inside the patch.
- Do NOT re-emit slots that match the deterministicPatch with the same value (parser already handled them).
`;

    const userPrompt = `Coach's observation:
"${observationText.trim()}"

Current personnel (canonical slot → jersey, may be partial or fully filled from carry-forward):
${JSON.stringify(currentPersonnel ?? {}, null, 2)}

Deterministic parser already extracted:
${JSON.stringify(deterministicPatch ?? {}, null, 2)}

Roster (jersey → name; informational only; do NOT invent entries):
${rosterLines || "  (none provided)"}

Return ONLY canonical pos* keys you can confidently infer. Omit everything else.`;

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
                name: "propose_personnel",
                description:
                  "Propose canonical Pass 2 personnel slot assignments inferred from the coach's observation. Omit slots you cannot confidently infer.",
                parameters: buildSchema(),
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "propose_personnel" },
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
      // Some models may return content instead of a tool_call — try JSON-in-content as a fallback.
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
          JSON.stringify({ patch: {}, error: "AI returned no structured personnel output.", errorCategory: "model_empty" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Server-side defensive filter: canonical key + integer 0..99 only.
    const patch: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!CANONICAL_SET.has(k)) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isInteger(n)) continue;
      if (n < 0 || n > 99) continue;
      patch[k] = n;
    }

    return new Response(
      JSON.stringify({ patch }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-enrich-personnel error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", errorCategory: "server_exception" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
