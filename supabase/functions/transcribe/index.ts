/**
 * Transcribe — football-aware speech-to-text for coach dictation.
 * Input: multipart { file, keywords (JSON string[]) }.
 * Output: { text } or { error } with upstream status preserved.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_BYTES = 20 * 1024 * 1024;
const MODEL = "openai/gpt-transcribe";
const PROMPT =
  "American youth/high school football film breakdown narration by a coach. Expect down and distance (e.g. 3rd and 7), yard lines (own side is negative, e.g. \"-23 yard line\" or \"our 23\"; keep the minus sign; opponent side is positive), jersey numbers spoken as digits, position letters (X, Y, Z, H, F, LT, LG, C, RG, RT), formation and play names, and grades like plus one or minus two. Write numbers as digits.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Transcription is not configured" }, 500);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_BYTES) {
      return json({ error: "Invalid audio" }, 400);
    }
    let keywords: string[] = [];
    try {
      const raw = JSON.parse(String(form.get("keywords") ?? "[]"));
      if (Array.isArray(raw)) keywords = raw.filter((k) => typeof k === "string" && k.length <= 60).slice(0, 200);
    } catch { /* ignore */ }

    const type = file.type.startsWith("audio/") ? file.type : "audio/webm";
    const audio = new File([await file.arrayBuffer()], file.name || "clip.webm", { type });

    const up = new FormData();
    up.append("model", MODEL);
    up.append("file", audio, audio.name);
    up.append("response_format", "json");
    up.append("prompt", PROMPT);
    up.append("languages", "en");
    for (const k of keywords) up.append("keywords", k);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: up,
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.error(`transcribe upstream [${resp.status}]: ${detail}`);
      const msg =
        resp.status === 402 ? "AI credits are exhausted. Add credits to keep using enhanced dictation."
        : resp.status === 429 ? "Transcription is busy. Try again in a moment."
        : "Transcription failed";
      return json({ error: msg }, resp.status);
    }
    const data = await resp.json();
    return json({ text: typeof data?.text === "string" ? data.text : "" });
  } catch (e) {
    console.error("transcribe error", e);
    return json({ error: "Transcription failed" }, 500);
  }
});
