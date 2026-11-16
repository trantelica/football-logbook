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

import Anthropic from "npm:@anthropic-ai/sdk@1.4.0";

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
      currentPersonnel,
      deterministicPatch,
      positionAliases,
      roster,
    } = body as ChatData;

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

    const result = await callModel(ai, systemPrompt, userPrompt, {
      name: "propose_personnel",
      description:
        "Propose canonical Pass 2 personnel slot assignments inferred from the coach's observation. Omit slots you cannot confidently infer.",
      parameters: buildSchema(),
    });
    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: result.error, errorCategory: result.errorCategory }),
        { status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const data = result.data;

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
      JSON.stringify({ patch, aiSource: result.source }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-enrich-personnel error:", e);
    return new Response(
      JSON.stringify({ error: "Unexpected error", errorCategory: "server_exception" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
