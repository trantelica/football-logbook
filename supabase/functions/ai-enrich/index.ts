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
 * Calls the coach's own AI provider when they registered a key (aiConfig),
 * otherwise the built-in Lovable AI Gateway, to propose values grounded in
 * observation text.
 */

import Anthropic from "npm:@anthropic-ai/sdk@1.4.0";

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
  suspectFields: string[] = [],
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

  // Slice D1: optional `corrections` block, only when suspectFields supplied.
  if (suspectFields.length > 0) {
    const correctionProps: Record<string, unknown> = {};
    for (const f of suspectFields) {
      correctionProps[f] = {
        type: "object",
        description: `Optional AI-proposed correction for parser-filled ${f}. Omit unless the parser value is clearly wrong given the coach's observation.`,
        properties: {
          value: { type: "string", description: "Proposed corrected canonical value" },
          matchType: {
            type: "string",
            enum: ["exact", "fuzzy", "candidate_new"],
          },
          reasonCode: { type: "string", description: "Short reason code from suspicion evidence (informational)" },
        },
        required: ["value", "matchType"],
        additionalProperties: false,
      };
    }
    properties.corrections = {
      type: "object",
      description:
        "Optional AI-proposed corrections to suspicious parser-filled governed fields. Only include a field if you have strong evidence from the coach's observation that the parser value is wrong. OMIT this entire object if no corrections are warranted.",
      properties: correctionProps,
      additionalProperties: false,
    };
  }

  return {
    type: "object",
    description: "Object containing only the fields you can confidently infer from the coach's observation. Omit any field you cannot infer.",
    properties,
    additionalProperties: false,
  };
}

/**
 * Only signed-in coaches may spend AI credits.
 *
 * These functions are reachable by anyone who knows the project URL, and the
 * publishable key is public by design, so neither is proof of anything. The
 * caller must present a real user session. Set the optional AI_ALLOWED_EMAILS
 * secret (comma-separated) to restrict use to named accounts, because sign-up
 * itself is open.
 *
 * Kept inline in each function file so every function deploys on its own.
 * Returns null when the caller may proceed, otherwise the response to send.
 */
async function requireUser(req: Request): Promise<Response | null> {
  const deny = (status: number, error: string) =>
    new Response(JSON.stringify({ error, errorCategory: "auth" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  const signIn = "AI assist is not set up on this device. Open the \u2026 menu, then AI setup.";

  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authorization)) return deny(401, signIn);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const apiKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    req.headers.get("apikey");
  if (!supabaseUrl || !apiKey) {
    console.error("requireUser: SUPABASE_URL or API key missing");
    return deny(500, "AI sign-in check is not configured");
  }

  let user: { id?: unknown; email?: unknown } | null = null;
  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: apiKey },
    });
    if (!resp.ok) return deny(401, signIn);
    user = await resp.json();
  } catch (e) {
    console.error("requireUser: auth lookup failed", e);
    return deny(503, "Could not confirm your sign-in. Try again in a moment.");
  }
  if (!user || typeof user.id !== "string" || !user.id) return deny(401, signIn);

  const allowed = (Deno.env.get("AI_ALLOWED_EMAILS") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length > 0) {
    const email = typeof user.email === "string" ? user.email.toLowerCase() : "";
    if (!allowed.includes(email)) return deny(403, "This account is not approved for AI assist.");
  }
  return null;
}

// ── BEGIN AI provider block ─────────────────────────────────────────────────
// Kept identical in ai-enrich, ai-enrich-grades and ai-enrich-personnel
// (functions deploy as single files; a test fails if the copies drift).
//
// A coach can register their own AI key in the app (… menu, then AI setup).
// The browser then sends { provider, apiKey, model } as `aiConfig` with each
// request. The key is used for that one upstream call and is never stored or
// logged here. With no `aiConfig`, the built-in AI is used and the caller must
// be signed in (see requireUser).

type AiProvider = "gemini" | "openai" | "anthropic";
interface AiConfig { provider: AiProvider; apiKey: string; model: string }
interface AiTool { name: string; description: string; parameters: Record<string, unknown> }
// The provider answer is untyped JSON; every read of it below is guarded.
// deno-lint-ignore no-explicit-any
type ChatData = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type AiCallResult =
  | { ok: true; data: ChatData; source: "own" | "builtin" }
  | { ok: false; status: number; error: string; errorCategory: string };

const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Claude",
};
const AI_SETUP_HINT = "Open the … menu, then AI setup.";
const AI_UPSTREAM: Record<Exclude<AiProvider, "anthropic">, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

/**
 * Reads the caller's own-key settings.
 * null = none sent (use built-in AI); "invalid" = sent but unusable.
 * The provider picks a fixed upstream address; nothing the caller sends is
 * ever used as a URL.
 */
function readAiConfig(raw: unknown): AiConfig | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return "invalid";
  const { provider, apiKey, model } = raw as Record<string, unknown>;
  if (provider !== "gemini" && provider !== "openai" && provider !== "anthropic") return "invalid";
  if (typeof apiKey !== "string" || !/^\S{8,400}$/.test(apiKey)) return "invalid";
  if (typeof model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(model)) return "invalid";
  return { provider, apiKey, model };
}

function aiFail(status: number, error: string, errorCategory: string): AiCallResult {
  return { ok: false, status, error, errorCategory };
}

function redactKey(text: string, key: string): string {
  return text.split(key).join("[key]");
}

/** Turns a provider's refusal into a plain message the coach can act on. */
function ownKeyFailure(ai: AiConfig, status: number, detail: string): AiCallResult {
  const who = AI_PROVIDER_LABEL[ai.provider];
  const d = detail.toLowerCase();
  const badKey =
    status === 401 || status === 403 ||
    d.includes("api key not valid") || d.includes("valid api key") ||
    d.includes("invalid x-api-key") || d.includes("incorrect api key");
  if (badKey) return aiFail(401, `Your ${who} key was not accepted. ${AI_SETUP_HINT}`, "key_rejected");
  if (status === 402 || d.includes("credit balance") || d.includes("insufficient_quota")) {
    return aiFail(402, `Your ${who} account has no credit left. Add credit on your ${who} account, then try again.`, "credits_exhausted");
  }
  if (status === 429) {
    return aiFail(429, `${who} is busy or your plan's limit was reached. Try again shortly.`, "rate_limited");
  }
  if (status === 404) {
    return aiFail(400, `The model "${ai.model}" is not available on your ${who} account. ${AI_SETUP_HINT}`, "model_unavailable");
  }
  if (status === 400) {
    return aiFail(400, `${who} could not handle this request with the model "${ai.model}". ${AI_SETUP_HINT}`, "model_error");
  }
  return aiFail(502, `${who} had a problem. Try again in a moment.`, "gateway_error");
}

/** If the model answered with JSON text instead of a function call, present it as the call. */
function withToolCallFromText(data: ChatData, toolName: string): ChatData {
  const message = data?.choices?.[0]?.message;
  if (!message || message.tool_calls?.[0]?.function?.arguments) return data;
  const content = typeof message.content === "string" ? message.content : "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return data;
  try {
    const parsed = JSON.parse(match[0]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      message.tool_calls = [{ type: "function", function: { name: toolName, arguments: JSON.stringify(parsed) } }];
    }
  } catch { /* leave the text answer as it is */ }
  return data;
}

function postChat(
  url: string,
  key: string,
  model: string,
  system: string,
  user: string,
  tool: AiTool,
  toolChoice: unknown,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [{ type: "function", function: tool }],
      tool_choice: toolChoice,
    }),
  });
}

async function callClaude(ai: AiConfig, system: string, user: string, tool: AiTool): Promise<AiCallResult> {
  const client = new Anthropic({ apiKey: ai.apiKey, maxRetries: 1, timeout: 60_000 });
  try {
    // Current Claude models reject a forced tool call, so the tool is offered
    // and the prompt says to use it.
    const msg = await client.messages.create({
      model: ai.model,
      max_tokens: 8000,
      system: `${system}\n\nAnswer by calling the ${tool.name} tool exactly once. Do not answer in plain text.`,
      messages: [{ role: "user", content: user }],
      tools: [{
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool.InputSchema,
      }],
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
    });
    let args: unknown = null;
    let text = "";
    for (const block of msg.content) {
      if (block.type === "tool_use" && args === null) args = block.input;
      else if (block.type === "text") text += block.text;
    }
    const message: Record<string, unknown> = { content: text || null };
    if (args !== null) {
      message.tool_calls = [{ type: "function", function: { name: tool.name, arguments: JSON.stringify(args) } }];
    }
    return { ok: true, data: withToolCallFromText({ choices: [{ message }] }, tool.name), source: "own" };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      const detail = redactKey(String(e.message ?? ""), ai.apiKey);
      console.error("AI anthropic error:", e.status, detail.slice(0, 300));
      return ownKeyFailure(ai, typeof e.status === "number" ? e.status : 502, detail);
    }
    throw e;
  }
}

/**
 * Asks the model to fill in the tool's fields and returns the answer in
 * chat-completions shape (`choices[0].message.tool_calls[0].function.arguments`)
 * whichever provider produced it.
 */
async function callModel(ai: AiConfig | null, system: string, user: string, tool: AiTool): Promise<AiCallResult> {
  const forced = { type: "function", function: { name: tool.name } };

  if (!ai) {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      console.error("callModel: LOVABLE_API_KEY missing");
      return aiFail(500, "AI service unavailable", "auth");
    }
    const resp = await postChat(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      key,
      "google/gemini-3-flash-preview",
      system,
      user,
      tool,
      forced,
    );
    if (resp.status === 429) return aiFail(429, "AI rate limited. Try again shortly.", "rate_limited");
    if (resp.status === 402) {
      return aiFail(402, "AI credits exhausted. Add funds in Settings > Workspace > Usage.", "credits_exhausted");
    }
    if (!resp.ok) {
      console.error("AI gateway error:", resp.status, await resp.text());
      return aiFail(500, "AI service error", "gateway_error");
    }
    return { ok: true, data: await resp.json(), source: "builtin" };
  }

  if (ai.provider === "anthropic") return callClaude(ai, system, user, tool);

  const url = AI_UPSTREAM[ai.provider];
  let resp = await postChat(url, ai.apiKey, ai.model, system, user, tool, forced);
  if (resp.status === 400) {
    const detail = redactKey(await resp.text(), ai.apiKey);
    if (detail.toLowerCase().includes("api key")) return ownKeyFailure(ai, 400, detail);
    // Some models reject a forced function call. Ask once more and let the
    // model choose, with the prompt saying to use the function.
    const nudged = `${system}\n\nAnswer by calling the ${tool.name} function. Do not answer in plain text.`;
    resp = await postChat(url, ai.apiKey, ai.model, nudged, user, tool, "auto");
  }
  if (!resp.ok) {
    const detail = redactKey(await resp.text(), ai.apiKey);
    console.error(`AI ${ai.provider} error:`, resp.status, detail.slice(0, 300));
    return ownKeyFailure(ai, resp.status, detail);
  }
  return { ok: true, data: withToolCallFromText(await resp.json(), tool.name), source: "own" };
}
// ── END AI provider block ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed;
  } catch { /* an unreadable body is treated as an empty one */ }

  // A coach using their own AI key needs no sign-in. The built-in AI does.
  const ai = readAiConfig(body.aiConfig);
  if (ai === "invalid") {
    return new Response(
      JSON.stringify({ error: `Your AI setup is incomplete. ${AI_SETUP_HINT}`, errorCategory: "ai_setup" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!ai) {
    const denied = await requireUser(req);
    if (denied) return denied;
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
      suspectFields,
      suspicionEvidence,
    } = body as ChatData;

    const suspectList: string[] = Array.isArray(suspectFields) ? suspectFields : [];

    if (
      !candidate ||
      !Array.isArray(unresolvedFields) ||
      (unresolvedFields.length === 0 && suspectList.length === 0)
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

    const MAX_INPUT_LEN = 4000;
    if (observationText.length > MAX_INPUT_LEN) {
      return new Response(
        JSON.stringify({ proposal: {}, error: `Observation text too long (max ${MAX_INPUT_LEN} chars)` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
- Explicit signed yardLn values are VALID (e.g. -23). Never flip, drop or "correct" an explicit sign.
${locationMapping.perspective === "defense"
  ? '- DEFENSE: The opponent is the offense. Coach says "their XX" / "opponent\'s XX" => yardLn = -XX; "our XX" / "our own XX" => yardLn = +XX. Negative means the opponent offense\'s own territory, not the coach\'s territory.'
  : '- OFFENSE: "our XX" / "our own XX" => yardLn = -XX; "their XX" / "opponent\'s XX" => yardLn = +XX.'}
- "minus XX" / "negative XX" => yardLn = -XX in BOTH perspectives.
- If "our" or "their" context is missing and cannot be inferred, OMIT yardLn entirely.
- Do NOT invent your own location interpretation model.`;
    }

    // Slice A: section context note for prompt scoping. The client is the
    // authoritative gate; this is informational only.
    const sectionInstruction = typeof activeSection === "string" && activeSection
      ? `\nActive section: ${activeSection}. Only propose values for fields listed in the unresolved fields list (already scoped to this section's owned fields).${activeSection.startsWith("def") ? '\nThis is Pass 4, ODK=D. The opponent is the offense. gainLoss describes yards gained/lost by their offense. retYards is a separately narrated defensive return distance; never copy gainLoss to retYards or infer a return distance. Defensive front, blitz and coverage must be explicitly named; never infer a call from the result. Playmaker and award fields (tackler1-4, interceptedBy, coverPlayer, pbr, dawg, unsung) are integer jersey numbers: propose one ONLY when the coach explicitly names or numbers that player for that role (e.g. "tackle by 44", "intercepted by 21", "dawg to Smith"). Never invent a player, never copy the same jersey into multiple roles unless the coach clearly credits one player with both, and fill tacklers in spoken order starting at tackler1.' : ''}`
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
${JSON.stringify(fieldHints ?? {}, null, 2)}
${suspectList.length > 0 ? `
Parser suspicion (Slice D1): The deterministic parser produced potentially-wrong values for these governed fields: ${JSON.stringify(suspectList)}. You MAY include a top-level "corrections" object with proposed replacements ONLY for those fields. Each correction must use the same { value, matchType } shape as governed proposals. OMIT a correction unless the coach's observation strongly contradicts the parser value. Do NOT propose a correction equal to the parser value.

Suspicion evidence:
${JSON.stringify(suspicionEvidence ?? {}, null, 2)}
` : ""}`;

    const userPrompt = `Coach's observation:
"${observationText.trim()}"

Fields already resolved by deterministic parser:
${JSON.stringify(deterministicPatch ?? {}, null, 2)}

Current play state (all resolved fields):
${JSON.stringify(candidate, null, 2)}

Unresolved fields needing suggestions: ${JSON.stringify(unresolvedFields)}

Return ONLY a JSON object with values you can confidently infer from the coach's observation. For governed lookup fields (those with governedValues in hints), return { "value": "...", "matchType": "exact"|"fuzzy"|"candidate_new" }. For other fields, return plain values. Omit fields you cannot infer. Example: {"hash": "L", "result": "Rush", "offForm": {"value": "Shotgun Trips", "matchType": "exact"}}`;

    const result = await callModel(ai, systemPrompt, userPrompt, {
      name: "suggest_fields",
      description:
        "Return suggested values for unresolved play fields based on the coach's observation. Omit any field you cannot confidently infer.",
      parameters: buildSuggestFieldsSchema(unresolvedFields, fieldHints ?? {}, suspectList),
    });
    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: result.error, errorCategory: result.errorCategory }),
        { status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const data = result.data;

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
      if (k === "corrections") continue; // Slice D1: extracted separately below
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

    // Slice D1: extract corrections (defensive: only fields in suspectList).
    let correctionsOut: Record<string, unknown> | undefined;
    if (suspectList.length > 0) {
      const rawCorr = (proposal as Record<string, unknown>).corrections;
      if (rawCorr && typeof rawCorr === "object" && !Array.isArray(rawCorr)) {
        const suspectSet = new Set(suspectList);
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rawCorr as Record<string, unknown>)) {
          if (!suspectSet.has(k)) continue;
          if (!v || typeof v !== "object" || Array.isArray(v)) continue;
          const obj = v as Record<string, unknown>;
          const val = obj.value;
          const mt = obj.matchType;
          if (typeof val !== "string" || !val.trim()) continue;
          if (mt !== "exact" && mt !== "fuzzy" && mt !== "candidate_new") continue;
          out[k] = {
            value: val,
            matchType: mt,
            ...(typeof obj.reasonCode === "string" ? { reasonCode: obj.reasonCode } : {}),
          };
        }
        if (Object.keys(out).length > 0) correctionsOut = out;
      }
    }

    return new Response(
      JSON.stringify(
        correctionsOut
          ? { proposal: filtered, corrections: correctionsOut, aiSource: result.source }
          : { proposal: filtered, aiSource: result.source },
      ),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-enrich error:", e);
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
