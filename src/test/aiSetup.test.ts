import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  aiRequestConfig,
  cleanKey,
  clearAiSetup,
  getAiSetup,
  guessProviderFromKey,
  listModels,
  maskKey,
  onAiSetupChange,
  pickRecommendedModel,
  saveAiSetup,
  CLAUDE_MODELS,
} from "@/engine/aiSetup";

const KEY = "test-own-key-0123456789";

beforeEach(() => localStorage.clear());

describe("saved AI setup", () => {
  it("round-trips provider, key and model on this device", () => {
    expect(getAiSetup()).toBeNull();
    expect(aiRequestConfig()).toBeNull();
    expect(saveAiSetup({ provider: "gemini", apiKey: KEY, model: "gemini-2.5-flash" })).toBe(true);
    expect(aiRequestConfig()).toEqual({ provider: "gemini", apiKey: KEY, model: "gemini-2.5-flash" });
    expect(getAiSetup()?.savedAt).toMatch(/^\d{4}-/);
    clearAiSetup();
    expect(getAiSetup()).toBeNull();
  });

  it("ignores a damaged or half-filled record instead of sending it", () => {
    for (const bad of ["not json", "null", '{"provider":"gemini"}', '{"provider":"other","apiKey":"k","model":"m"}']) {
      localStorage.setItem("hudl.aiSetup", bad);
      expect(getAiSetup()).toBeNull();
    }
  });

  it("tells listeners when the setup changes", () => {
    const cb = vi.fn();
    const off = onAiSetupChange(cb);
    saveAiSetup({ provider: "openai", apiKey: KEY, model: "gpt-5-mini" });
    clearAiSetup();
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    saveAiSetup({ provider: "openai", apiKey: KEY, model: "gpt-5-mini" });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("reports when the browser refuses to store the key", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(saveAiSetup({ provider: "openai", apiKey: KEY, model: "gpt-5-mini" })).toBe(false);
    spy.mockRestore();
  });
});

describe("key handling", () => {
  it("cleans up what a copy and paste brings along", () => {
    expect(cleanKey("  sk-abc 123\n")).toBe("sk-abc123");
    expect(cleanKey('"AIzaSyExample"')).toBe("AIzaSyExample");
    expect(cleanKey("“sk-ant-x”")).toBe("sk-ant-x");
  });

  it("shows only the tail of a key", () => {
    expect(maskKey("sk-abcdefghijklmnop")).toBe("••••mnop");
    expect(maskKey("short")).toBe("••••");
  });

  it("recognises which provider a key belongs to", () => {
    expect(guessProviderFromKey("sk-ant-api03-xyz")).toBe("anthropic");
    expect(guessProviderFromKey("sk-proj-xyz")).toBe("openai");
    expect(guessProviderFromKey("AIzaSyExample")).toBe("gemini");
    expect(guessProviderFromKey("something-else")).toBeNull();
  });
});

describe("recommended model", () => {
  const opts = (...ids: string[]) => ids.map((id) => ({ id, label: id }));

  it("picks the newest stable Gemini Flash, not lite, not preview", () => {
    expect(pickRecommendedModel("gemini", opts(
      "gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3-flash-preview", "gemini-flash-latest",
    ))).toBe("gemini-2.5-flash");
    expect(pickRecommendedModel("gemini", opts("gemini-2.5-flash", "gemini-3-flash", "gemini-3-pro"))).toBe("gemini-3-flash");
  });

  it("falls back to a preview Flash, then to anything, rather than nothing", () => {
    expect(pickRecommendedModel("gemini", opts("gemini-3-pro", "gemini-3-flash-preview"))).toBe("gemini-3-flash-preview");
    expect(pickRecommendedModel("gemini", opts("gemini-4-hydrogen"))).toBe("gemini-4-hydrogen");
    expect(pickRecommendedModel("gemini", [])).toBeNull();
  });

  it("picks the newest OpenAI mini model", () => {
    expect(pickRecommendedModel("openai", opts("gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-5-mini", "gpt-5-nano", "o3"))).toBe("gpt-5-mini");
    expect(pickRecommendedModel("openai", opts("gpt-4o", "gpt-4.1"))).toBe("gpt-4.1");
  });

  it("picks Claude Haiku", () => {
    expect(pickRecommendedModel("anthropic", CLAUDE_MODELS)).toBe("claude-haiku-5-5");
  });
});

describe("listing models with a key", () => {
  it("asks Google with the key in a header and keeps only text models", async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      models: [
        { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-2.5-flash-image", displayName: "Image", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-embedding-001", displayName: "Embed", supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemma-3", displayName: "Gemma", supportedGenerationMethods: ["generateContent"] },
      ],
    }));
    const res = await listModels("gemini", KEY, fetchImpl as unknown as typeof fetch);
    expect(res).toEqual({ ok: true, models: [{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
  });

  it("asks OpenAI and drops audio, image and dated models, newest first", async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      data: [
        { id: "gpt-4o-mini", created: 1 },
        { id: "gpt-5-mini", created: 3 },
        { id: "gpt-5-mini-2025-08-07", created: 3 },
        { id: "gpt-4o-transcribe", created: 2 },
        { id: "gpt-image-1", created: 2 },
        { id: "text-embedding-3-small", created: 2 },
        { id: "whisper-1", created: 1 },
      ],
    }));
    const res = await listModels("openai", KEY, fetchImpl as unknown as typeof fetch);
    expect(res.ok && res.models.map((m) => m.id)).toEqual(["gpt-5-mini", "gpt-4o-mini"]);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  it("offers the fixed Claude list without contacting anyone from the browser", async () => {
    const fetchImpl = vi.fn();
    expect(await listModels("anthropic", KEY, fetchImpl as unknown as typeof fetch)).toEqual({ ok: true, models: CLAUDE_MODELS });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("explains a rejected key in plain words", async () => {
    const google = vi.fn(async () => new Response('{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 }));
    const g = await listModels("gemini", KEY, google as unknown as typeof fetch);
    expect(g).toMatchObject({ ok: false, reason: "key" });
    expect(g.ok === false && g.message).toContain("Google AI Studio");

    const openai = vi.fn(async () => new Response("{}", { status: 401 }));
    expect(await listModels("openai", KEY, openai as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "key" });
  });

  it("tells a busy account and a dropped connection apart from a bad key", async () => {
    const busy = vi.fn(async () => new Response("{}", { status: 429 }));
    expect(await listModels("openai", KEY, busy as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "limit" });
    const offline = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await listModels("gemini", KEY, offline as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "network" });
  });
});
