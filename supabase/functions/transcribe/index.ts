/**
 * Transcribe — football-aware speech-to-text for coach dictation.
 * Input: multipart { file, keywords (JSON string[]) }.
 * Output: { text } or { error } with upstream status preserved.
 *
 * A coach who registered their own OpenAI or Google Gemini key (… menu, then
 * AI setup) sends it as form fields aiProvider / aiKey / aiModel. The key is
 * used for that one upstream call and is never stored or logged here. Without
 * those fields the built-in AI is used and the caller must be signed in.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_BYTES = 20 * 1024 * 1024;
const GATEWAY_MODEL = "openai/gpt-transcribe";
const OPENAI_MODEL = "gpt-transcribe";
const PROMPT =
  "American youth/high school football film breakdown narration by a coach. Expect down and distance (e.g. 3rd and 7), yard lines (own side is negative, e.g. \"-23 yard line\" or \"our 23\"; keep the minus sign; opponent side is positive), jersey numbers spoken as digits, position letters (X, Y, Z, H, F, LT, LG, C, RG, RT), formation and play names, and grades like plus one or minus two. Write numbers as digits.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

type OwnKey = { provider: "openai" | "gemini"; apiKey: string; model: string };

const AI_SETUP_HINT = "Open the … menu, then AI setup.";
const OWN_LABEL = { openai: "OpenAI", gemini: "Google Gemini" } as const;

/** null = no own key sent (use built-in AI); "invalid" = sent but unusable. */
function readOwnKey(form: FormData | null): OwnKey | null | "invalid" {
  const provider = form?.get("aiProvider");
  if (provider === null || provider === undefined) return null;
  const apiKey = form?.get("aiKey");
  const model = form?.get("aiModel") ?? "";
  if (provider !== "openai" && provider !== "gemini") return "invalid";
  if (typeof apiKey !== "string" || !/^\S{8,400}$/.test(apiKey)) return "invalid";
  if (typeof model !== "string") return "invalid";
  // The Gemini model name becomes part of a fixed Google address, so it is
  // limited to plain model-name characters.
  if (provider === "gemini" && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(model)) return "invalid";
  return { provider, apiKey, model };
}

function ownKeyError(own: OwnKey, status: number, detail: string): Response {
  const who = OWN_LABEL[own.provider];
  const d = detail.toLowerCase();
  if (status === 401 || status === 403 || d.includes("api key")) {
    return json({ error: `Your ${who} key was not accepted. ${AI_SETUP_HINT}` }, 401);
  }
  if (status === 402 || d.includes("insufficient_quota")) {
    return json({ error: `Your ${who} account has no credit left. Dictation is using the browser for now.` }, 402);
  }
  if (status === 429) return json({ error: `${who} is busy or your plan's limit was reached. Try again in a moment.` }, 429);
  return json({ error: "Transcription failed" }, status >= 400 && status < 500 ? 400 : 502);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** OpenAI-style transcription: the built-in gateway and OpenAI take the same form. */
function transcriptionForm(model: string, audio: File, keywords: string[]): FormData {
  const up = new FormData();
  up.append("model", model);
  up.append("file", audio, audio.name);
  up.append("response_format", "json");
  up.append("prompt", PROMPT);
  up.append("languages", "en");
  for (const k of keywords) up.append("keywords", k);
  return up;
}

async function transcribeWithGemini(own: OwnKey, audio: File, keywords: string[]): Promise<Response> {
  const vocabulary = keywords.length ? `\nTeam vocabulary: ${keywords.join(", ")}.` : "";
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${own.model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": own.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: PROMPT + vocabulary }] },
        contents: [{
          role: "user",
          parts: [
            { inline_data: { mime_type: audio.type.split(";")[0], data: toBase64(new Uint8Array(await audio.arrayBuffer())) } },
            { text: "Transcribe this recording word for word. Reply with the transcript only, no commentary. If there is no speech, reply with nothing." },
          ],
        }],
      }),
    },
  );
  if (!resp.ok) {
    const detail = (await resp.text()).split(own.apiKey).join("[key]");
    console.error(`transcribe gemini [${resp.status}]: ${detail.slice(0, 300)}`);
    return ownKeyError(own, resp.status, detail);
  }
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p: { text?: unknown }) => (typeof p?.text === "string" ? p.text : "")).join("").trim()
    : "";
  return json({ text, aiSource: "own" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let form: FormData | null = null;
  try { form = await req.formData(); } catch { /* handled below as invalid audio */ }

  // A coach using their own AI key needs no sign-in. The built-in AI does.
  const own = readOwnKey(form);
  if (own === "invalid") return json({ error: `Your AI setup is incomplete. ${AI_SETUP_HINT}` }, 400);
  if (!own) {
    const denied = await requireUser(req);
    if (denied) return denied;
  }

  try {
    const builtInKey = own ? null : Deno.env.get("LOVABLE_API_KEY");
    if (!own && !builtInKey) return json({ error: "Transcription is not configured" }, 500);

    const file = form?.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_BYTES) {
      return json({ error: "Invalid audio" }, 400);
    }
    let keywords: string[] = [];
    try {
      const raw = JSON.parse(String(form?.get("keywords") ?? "[]"));
      if (Array.isArray(raw)) keywords = raw.filter((k) => typeof k === "string" && k.length <= 60).slice(0, 200);
    } catch { /* ignore */ }

    const type = file.type.startsWith("audio/") ? file.type : "audio/webm";
    const audio = new File([await file.arrayBuffer()], file.name || "clip.webm", { type });

    if (own?.provider === "gemini") return await transcribeWithGemini(own, audio, keywords);

    const resp = await fetch(
      own ? "https://api.openai.com/v1/audio/transcriptions" : "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${own ? own.apiKey : builtInKey}` },
        body: transcriptionForm(own ? OPENAI_MODEL : GATEWAY_MODEL, audio, keywords),
      },
    );
    if (!resp.ok) {
      const detail = own ? (await resp.text()).split(own.apiKey).join("[key]") : await resp.text();
      console.error(`transcribe upstream [${resp.status}]: ${detail.slice(0, 500)}`);
      if (own) return ownKeyError(own, resp.status, detail);
      const msg =
        resp.status === 402 ? "AI credits are exhausted. Add credits to keep using enhanced dictation."
        : resp.status === 429 ? "Transcription is busy. Try again in a moment."
        : "Transcription failed";
      return json({ error: msg }, resp.status);
    }
    const data = await resp.json();
    return json({ text: typeof data?.text === "string" ? data.text : "", aiSource: own ? "own" : "builtin" });
  } catch (e) {
    console.error("transcribe error", e);
    return json({ error: "Transcription failed" }, 500);
  }
});
