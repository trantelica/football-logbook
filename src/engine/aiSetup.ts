/**
 * AI setup — a coach's own AI key and model, kept on this device.
 *
 * The app can run AI assist two ways: the built-in AI (needs sign-in), or the
 * coach's own account with Google Gemini, OpenAI or Claude. This module holds
 * the second: which provider, the key, and the model.
 *
 * Where the key lives: localStorage on this device only. It is deliberately
 * NOT in IndexedDB, so it can never ride along in a season package, session
 * archive, debug export or cloud backup. It leaves the browser only inside an
 * AI request, to this app's AI function, which passes it to the provider for
 * that one call and does not keep it.
 *
 * Pure of React and of Supabase so it can be unit-tested directly. The live
 * end-to-end check lives in aiSetupCheck.ts.
 */

export type AiProvider = "gemini" | "openai" | "anthropic";

export interface AiRequestConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

export interface AiSetup extends AiRequestConfig {
  /** ISO timestamp of the last successful check-and-save. */
  savedAt: string;
}

export interface AiModelOption {
  id: string;
  label: string;
}

export interface AiProviderInfo {
  id: AiProvider;
  /** Name a coach would recognise. */
  label: string;
  /** Company or product named in error messages. */
  company: string;
  /** One line on the choice screen. */
  blurb: string;
  /** Whether a key from this provider can also power football-aware dictation. */
  dictation: boolean;
  keyPageUrl: string;
  keyPageName: string;
  /** Plain numbered steps for getting a key. */
  steps: string[];
  /** What a key from this provider usually starts with (hint only, never a gate). */
  keyPrefix: string;
}

export const AI_PROVIDER_ORDER: AiProvider[] = ["gemini", "openai", "anthropic"];

export const AI_PROVIDERS: Record<AiProvider, AiProviderInfo> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    company: "Google",
    blurb: "Easiest to start. Uses your Google account, and is usually free for light use.",
    dictation: true,
    keyPageUrl: "https://aistudio.google.com/apikey",
    keyPageName: "Google AI Studio",
    steps: [
      "Open Google AI Studio with the button below and sign in with your Google account.",
      "Press “Create API key”. Accept the terms if it asks.",
      "Press the copy button next to the new key.",
      "Come back here and paste it in the box.",
    ],
    keyPrefix: "AIza",
  },
  openai: {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    company: "OpenAI",
    blurb: "Pay as you go. A ChatGPT subscription does not include this; it is billed separately.",
    dictation: true,
    keyPageUrl: "https://platform.openai.com/api-keys",
    keyPageName: "the OpenAI key page",
    steps: [
      "Open the OpenAI key page with the button below and sign in or create an account.",
      "If it asks, add a payment method under Billing. A few dollars lasts a long time.",
      "Press “Create new secret key”, then “Copy”. It is only shown once.",
      "Come back here and paste it in the box.",
    ],
    keyPrefix: "sk-",
  },
  anthropic: {
    id: "anthropic",
    label: "Claude (Anthropic)",
    company: "Claude",
    blurb: "Pay as you go. A Claude subscription does not include this; it is billed separately.",
    dictation: false,
    keyPageUrl: "https://platform.claude.com/settings/keys",
    keyPageName: "the Claude Console",
    steps: [
      "Open the Claude Console with the button below and sign in or create an account.",
      "If it asks, add credit under Billing. A few dollars lasts a long time.",
      "Press “Create Key”, give it any name, then copy it. It is only shown once.",
      "Come back here and paste it in the box.",
    ],
    keyPrefix: "sk-ant-",
  },
};

/**
 * Claude models offered in setup. Claude's key is checked by this app's AI
 * function rather than from the browser, so there is no live list to read;
 * these are Anthropic's current stable names. The fast model comes first
 * because AI assist runs once per play.
 */
export const CLAUDE_MODELS: AiModelOption[] = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 — fast, lowest cost" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — balanced" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 — most capable, costs more" },
];

// ── Saved setup ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "hudl.aiSetup";
const CHANGE_EVENT = "hudl:ai-setup-changed";

function isProvider(v: unknown): v is AiProvider {
  return v === "gemini" || v === "openai" || v === "anthropic";
}

export function getAiSetup(): AiSetup | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<AiSetup> | null;
    if (!v || !isProvider(v.provider)) return null;
    if (typeof v.apiKey !== "string" || !v.apiKey) return null;
    if (typeof v.model !== "string" || !v.model) return null;
    return {
      provider: v.provider,
      apiKey: v.apiKey,
      model: v.model,
      savedAt: typeof v.savedAt === "string" ? v.savedAt : "",
    };
  } catch {
    return null;
  }
}

function announce() {
  try { window.dispatchEvent(new Event(CHANGE_EVENT)); } catch { /* non-browser */ }
}

/** Returns false if this browser refused to store it (private mode, storage full). */
export function saveAiSetup(config: AiRequestConfig): boolean {
  try {
    const setup: AiSetup = { ...config, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    announce();
    return true;
  } catch {
    return false;
  }
}

export function clearAiSetup(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  announce();
}

/** Calls back when the saved setup changes, in this tab or another. */
export function onAiSetupChange(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) cb(); };
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** What to attach to an AI request, or null to use the built-in AI. */
export function aiRequestConfig(): AiRequestConfig | null {
  const s = getAiSetup();
  return s ? { provider: s.provider, apiKey: s.apiKey, model: s.model } : null;
}

// ── Key handling ────────────────────────────────────────────────────────────

/** Strips the things that come along with a copy and paste: spaces, line breaks, quotes. */
export function cleanKey(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
}

/** Shows only the tail of a key, for "which key is this" on screen. */
export function maskKey(key: string): string {
  return key.length <= 8 ? "••••" : `••••${key.slice(-4)}`;
}

/** Best guess at which provider a key belongs to, from how it starts. */
export function guessProviderFromKey(key: string): AiProvider | null {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-")) return "openai";
  if (key.startsWith("AIza")) return "gemini";
  return null;
}

// ── Models ──────────────────────────────────────────────────────────────────

export type ModelListResult =
  | { ok: true; models: AiModelOption[] }
  | { ok: false; reason: "key" | "limit" | "network" | "other"; message: string };

const GEMINI_SKIP = /image|tts|audio|live|embedding|robotics|computer-use|learnlm|aqa|gemma/i;
const OPENAI_KEEP = /^(gpt-|o\d|chatgpt-)/;
const OPENAI_SKIP = /audio|realtime|transcribe|tts|image|search|embedding|instruct|codex|moderation|-\d{4}-\d{2}-\d{2}$|-\d{4}$/i;

function versionOf(id: string): number {
  const m = id.match(/^(?:gemini|gpt)-(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : -1;
}

/**
 * The model to preselect: the provider's fast, low-cost tier, newest stable
 * version. AI assist runs once per play, so speed and cost matter more here
 * than the last bit of reasoning power. Returns null for an empty list.
 */
export function pickRecommendedModel(provider: AiProvider, models: AiModelOption[]): string | null {
  if (models.length === 0) return null;
  const ids = models.map((m) => m.id);
  if (provider === "anthropic") return ids.find((id) => id.includes("haiku")) ?? ids[0];

  const unstable = (id: string) => /preview|exp|latest/i.test(id);
  const rank = (pool: string[]) =>
    [...pool].sort(
      (a, b) =>
        Number(unstable(a)) - Number(unstable(b)) ||
        versionOf(b) - versionOf(a) ||
        a.length - b.length,
    )[0];

  if (provider === "gemini") {
    const flash = ids.filter((id) => /flash/i.test(id) && !/lite/i.test(id));
    return rank(flash.length ? flash : ids);
  }
  const mini = ids.filter((id) => /^gpt-\d+(?:\.\d+)?o?-mini$/.test(id));
  if (mini.length) return rank(mini);
  const plain = ids.filter((id) => /^gpt-\d+(?:\.\d+)?o?$/.test(id));
  return rank(plain.length ? plain : ids);
}

function listFailure(provider: AiProvider, status: number, body: string): ModelListResult {
  const info = AI_PROVIDERS[provider];
  const b = body.toLowerCase();
  if (status === 401 || status === 403 || b.includes("api_key_invalid") || b.includes("api key not valid")) {
    return {
      ok: false,
      reason: "key",
      message: `${info.company} did not accept that key. Copy it again from ${info.keyPageName} and make sure you get the whole key.`,
    };
  }
  if (status === 429) {
    return {
      ok: false,
      reason: "limit",
      message: `${info.company} says this account is busy or over its limit. Wait a minute and try again.`,
    };
  }
  return {
    ok: false,
    reason: "other",
    message: `${info.company} could not check the key right now (code ${status}). Try again in a minute.`,
  };
}

/**
 * Asks the provider which models this key can use. This is the first half of
 * the key check: a rejected key fails here with a plain reason.
 *
 * Google and OpenAI are asked straight from the browser (both allow it), with
 * the key in a header, never in the address. Claude is not asked here: its key
 * is checked by the app's AI function, so this returns the fixed Claude list.
 */
export async function listModels(
  provider: AiProvider,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelListResult> {
  if (provider === "anthropic") return { ok: true, models: CLAUDE_MODELS };

  const info = AI_PROVIDERS[provider];
  let resp: Response;
  try {
    resp =
      provider === "gemini"
        ? await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
            headers: { "x-goog-api-key": apiKey },
          })
        : await fetchImpl("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
  } catch {
    return {
      ok: false,
      reason: "network",
      message: `Could not reach ${info.company}. Check your internet connection and try again.`,
    };
  }
  if (!resp.ok) return listFailure(provider, resp.status, await resp.text().catch(() => ""));

  let data: unknown;
  try { data = await resp.json(); } catch { data = null; }

  let models: AiModelOption[] = [];
  if (provider === "gemini") {
    const rows = (data as { models?: unknown[] } | null)?.models ?? [];
    models = rows.flatMap((row) => {
      const r = row as { name?: unknown; displayName?: unknown; supportedGenerationMethods?: unknown };
      const id = typeof r.name === "string" ? r.name.replace(/^models\//, "") : "";
      const methods = Array.isArray(r.supportedGenerationMethods) ? r.supportedGenerationMethods : [];
      if (!id.startsWith("gemini-") || GEMINI_SKIP.test(id) || !methods.includes("generateContent")) return [];
      return [{ id, label: typeof r.displayName === "string" && r.displayName ? r.displayName : id }];
    });
  } else {
    const rows = (data as { data?: unknown[] } | null)?.data ?? [];
    models = rows
      .flatMap((row) => {
        const r = row as { id?: unknown; created?: unknown };
        const id = typeof r.id === "string" ? r.id : "";
        if (!OPENAI_KEEP.test(id) || OPENAI_SKIP.test(id)) return [];
        return [{ id, label: id, created: typeof r.created === "number" ? r.created : 0 }];
      })
      .sort((a, b) => b.created - a.created)
      .map(({ id, label }) => ({ id, label }));
  }

  if (models.length === 0) {
    return {
      ok: false,
      reason: "other",
      message: `${info.company} accepted the key but listed no models this app can use. Check that the account is fully set up.`,
    };
  }
  return { ok: true, models };
}
