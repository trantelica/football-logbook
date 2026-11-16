/**
 * A coach can register their own AI key (… menu, then AI setup). The AI
 * functions must then use that key with the chosen provider, need no sign-in,
 * never fall back to the paid built-in AI by accident, and turn a provider's
 * refusal into words a coach can act on. This loads the actual function files
 * with a stand-in for the Deno runtime and drives the handlers directly.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { claudeStub } from "./stubs/anthropicSdk";

type Handler = (req: Request) => Promise<Response>;

const OWN_KEY = "test-own-key-0123456789";
const ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.example",
  SUPABASE_ANON_KEY: "public-key",
  LOVABLE_API_KEY: "builtin-secret",
};

function fnPath(name: string): string {
  return new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url).pathname;
}

async function loadHandler(name: string): Promise<Handler> {
  let handler: Handler | null = null;
  (globalThis as Record<string, unknown>).Deno = {
    env: { get: (k: string) => ENV[k] },
    serve: (h: Handler) => { handler = h; },
  };
  vi.resetModules();
  await import(/* @vite-ignore */ fnPath(name));
  if (!handler) throw new Error(`${name} did not register a handler`);
  return handler;
}

interface Call { url: string; headers: Record<string, string>; body: unknown }

/** Stand-in for fetch that records every outbound call. */
function mockFetch(respond: (call: Call, n: number) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    let body: unknown = init?.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* keep text */ } }
    const call = { url: String(input), headers, body };
    calls.push(call);
    return respond(call, calls.length);
  }));
  return calls;
}

function toolCallResponse(args: Record<string, unknown>): Response {
  return Response.json({
    choices: [{ message: { tool_calls: [{ function: { name: "x", arguments: JSON.stringify(args) } }] } }],
  });
}

const CHAT = [
  {
    name: "ai-enrich",
    body: {
      observationText: "Run to the left for four",
      candidate: { playNum: 1 },
      deterministicPatch: {},
      unresolvedFields: ["result"],
      fieldHints: { result: { label: "Result", allowedValues: ["Rush", "Complete"] } },
    },
    args: { result: "Rush" },
    read: (j: Record<string, unknown>) => j.proposal,
  },
  {
    name: "ai-enrich-grades",
    body: { narrationText: "left tackle plus two", parserPatch: {}, unresolvedFields: ["gradeLT"] },
    args: { gradeLT: 2 },
    read: (j: Record<string, unknown>) => j.patch,
  },
  {
    name: "ai-enrich-personnel",
    body: { observationText: "twelve at X", currentPersonnel: {}, deterministicPatch: {}, roster: [] },
    args: { posX: 12 },
    read: (j: Record<string, unknown>) => j.patch,
  },
] as const;

function post(body: unknown): Request {
  // No Authorization header: an own-key request must not need a sign-in.
  return new Request("https://fn.example/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  claudeStub.calls.length = 0;
  claudeStub.respond = () => ({ content: [], stop_reason: "end_turn" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (globalThis as Record<string, unknown>).Deno;
});

describe.each(CHAT)("$name with the coach's own key", ({ name, body, args, read }) => {
  it("uses an OpenAI key at OpenAI, with the chosen model and no sign-in", async () => {
    const calls = mockFetch(() => toolCallResponse(args));
    const handler = await loadHandler(name);
    const res = await handler(post({ ...body, aiConfig: { provider: "openai", apiKey: OWN_KEY, model: "gpt-5-mini" } }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.aiSource).toBe("own");
    expect(read(json)).toEqual(args);
    // One call, straight to the provider: no sign-in lookup, no built-in AI.
    expect(calls.map((c) => c.url)).toEqual(["https://api.openai.com/v1/chat/completions"]);
    expect(calls[0].headers.authorization).toBe(`Bearer ${OWN_KEY}`);
    expect((calls[0].body as { model: string }).model).toBe("gpt-5-mini");
  });

  it("uses a Gemini key at Google", async () => {
    const calls = mockFetch(() => toolCallResponse(args));
    const handler = await loadHandler(name);
    const res = await handler(post({ ...body, aiConfig: { provider: "gemini", apiKey: OWN_KEY, model: "gemini-2.5-flash" } }));
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.url)).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    ]);
    expect(calls[0].headers.authorization).toBe(`Bearer ${OWN_KEY}`);
  });

  it("uses a Claude key through the Claude SDK, offering the tool without forcing it", async () => {
    const calls = mockFetch(() => { throw new Error("Claude must go through the SDK"); });
    claudeStub.respond = () => ({
      stop_reason: "tool_use",
      content: [
        { type: "thinking", thinking: "" },
        { type: "tool_use", id: "t1", name: "x", input: args },
      ],
    });
    const handler = await loadHandler(name);
    const res = await handler(post({ ...body, aiConfig: { provider: "anthropic", apiKey: OWN_KEY, model: "claude-haiku-5-5" } }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.aiSource).toBe("own");
    expect(read(json)).toEqual(args);
    expect(calls).toEqual([]);
    expect(claudeStub.calls).toHaveLength(1);
    const { options, params } = claudeStub.calls[0];
    expect(options.apiKey).toBe(OWN_KEY);
    expect(params.model).toBe("claude-haiku-5-5");
    // Current Claude models answer a forced tool call with a 400.
    expect(params.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
    const tools = params.tools as { name: string; input_schema: { type: string } }[];
    expect(tools).toHaveLength(1);
    expect(tools[0].input_schema.type).toBe("object");
    expect(String(params.system)).toContain(`calling the ${tools[0].name} tool`);
  });

  it("tells the coach when the provider rejects the key, without echoing the key", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(() => new Response(`{"error":{"message":"Incorrect API key provided: ${OWN_KEY}"}}`, { status: 401 }));
    const handler = await loadHandler(name);
    const res = await handler(post({ ...body, aiConfig: { provider: "openai", apiKey: OWN_KEY, model: "gpt-5-mini" } }));
    const text = await res.text();
    expect(res.status).toBe(401);
    expect(JSON.parse(text).errorCategory).toBe("key_rejected");
    expect(text).toContain("AI setup");
    expect(text).not.toContain(OWN_KEY);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(OWN_KEY);
  });

  it("refuses a half-filled AI setup instead of quietly spending built-in credits", async () => {
    const calls = mockFetch(() => toolCallResponse(args));
    const handler = await loadHandler(name);
    for (const aiConfig of [
      { provider: "openai", apiKey: "", model: "gpt-5-mini" },
      { provider: "somewhere-else", apiKey: OWN_KEY, model: "m" },
      { provider: "gemini", apiKey: OWN_KEY, model: "../../other" },
      "openai",
    ]) {
      const res = await handler(post({ ...body, aiConfig }));
      expect(res.status).toBe(400);
      expect((await res.json()).errorCategory).toBe("ai_setup");
    }
    expect(calls).toEqual([]);
  });
});

describe("own-key edge cases (ai-enrich)", () => {
  const { body, args } = CHAT[0];
  const gemini = { provider: "gemini", apiKey: OWN_KEY, model: "gemini-2.5-flash" };

  it("asks again without forcing the function when a model rejects a forced call", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls = mockFetch((_c, n) =>
      n === 1 ? new Response('{"error":{"message":"tool_choice not supported"}}', { status: 400 }) : toolCallResponse(args));
    const handler = await loadHandler("ai-enrich");
    const res = await handler(post({ ...body, aiConfig: gemini }));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect((calls[0].body as { tool_choice: unknown }).tool_choice).toEqual({ type: "function", function: { name: "suggest_fields" } });
    expect((calls[1].body as { tool_choice: unknown }).tool_choice).toBe("auto");
  });

  it("does not retry when Google answers 400 because the key is wrong", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls = mockFetch(() => new Response('{"error":{"message":"Please pass a valid API key"}}', { status: 400 }));
    const handler = await loadHandler("ai-enrich");
    const res = await handler(post({ ...body, aiConfig: gemini }));
    expect(res.status).toBe(401);
    expect((await res.json()).errorCategory).toBe("key_rejected");
    expect(calls).toHaveLength(1);
  });

  it("accepts a JSON answer written as text when the model skips the function call", async () => {
    mockFetch(() => Response.json({ choices: [{ message: { content: 'Here you go: {"result":"Rush"}' } }] }));
    const handler = await loadHandler("ai-enrich");
    const res = await handler(post({ ...body, aiConfig: gemini }));
    expect((await res.json()).proposal).toEqual({ result: "Rush" });
  });

  it.each([
    [429, "rate_limited", 429],
    [402, "credits_exhausted", 402],
    [404, "model_unavailable", 400],
    [500, "gateway_error", 502],
  ])("maps a provider %i to %s", async (upstream, category, status) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(() => new Response("{}", { status: upstream }));
    const handler = await loadHandler("ai-enrich");
    const res = await handler(post({ ...body, aiConfig: { provider: "openai", apiKey: OWN_KEY, model: "gpt-5-mini" } }));
    expect(res.status).toBe(status);
    expect((await res.json()).errorCategory).toBe(category);
  });

  it("reports a Claude SDK refusal in the same plain terms", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(() => { throw new Error("no fetch expected"); });
    claudeStub.respond = () => { throw new claudeStub.APIError(401, "invalid x-api-key"); };
    const handler = await loadHandler("ai-enrich");
    const res = await handler(post({ ...body, aiConfig: { provider: "anthropic", apiKey: OWN_KEY, model: "claude-haiku-5-5" } }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("Claude key was not accepted");
  });

  it("still uses the built-in AI, and says so, for a signed-in coach with no key", async () => {
    const calls = mockFetch((c) =>
      c.url.endsWith("/auth/v1/user") ? Response.json({ id: "user-1", email: "coach@example.com" }) : toolCallResponse(args));
    const handler = await loadHandler("ai-enrich");
    const res = await handler(new Request("https://fn.example/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer session-token" },
      body: JSON.stringify(body),
    }));
    expect((await res.json()).aiSource).toBe("builtin");
    expect(calls.map((c) => c.url)).toEqual([
      "https://project.example/auth/v1/user",
      "https://ai.gateway.lovable.dev/v1/chat/completions",
    ]);
    expect(calls[1].headers.authorization).toBe("Bearer builtin-secret");
  });
});

describe("the provider block is the same in all three functions", () => {
  const block = (name: string) => {
    const src = readFileSync(resolve(process.cwd(), "supabase/functions", name, "index.ts"), "utf8");
    const a = src.indexOf("// ── BEGIN AI provider block");
    const b = src.indexOf("// ── END AI provider block");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    return src.slice(a, b);
  };
  it("has not drifted", () => {
    expect(block("ai-enrich-grades")).toBe(block("ai-enrich"));
    expect(block("ai-enrich-personnel")).toBe(block("ai-enrich"));
  });
});

describe("transcribe with the coach's own key", () => {
  // The test page's FormData and File are not the ones the server runtime's
  // Request understands. Use the runtime's own for these upload tests.
  beforeEach(async () => {
    const { File: RuntimeFile } = await import("node:buffer");
    const runtimeForm = await new Response("a=b", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }).formData();
    vi.stubGlobal("FormData", runtimeForm.constructor);
    vi.stubGlobal("File", RuntimeFile);
  });

  function clip(fields: Record<string, string>): Request {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(3000)], "clip.webm", { type: "audio/webm;codecs=opus" }));
    form.append("keywords", JSON.stringify(["Trips Right"]));
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return new Request("https://fn.example/", { method: "POST", body: form });
  }

  it("sends the clip to OpenAI on an OpenAI key, with no sign-in", async () => {
    const calls = mockFetch(() => Response.json({ text: "second and seven" }));
    const handler = await loadHandler("transcribe");
    const res = await handler(clip({ aiProvider: "openai", aiKey: OWN_KEY, aiModel: "gpt-5-mini" }));
    expect(await res.json()).toEqual({ text: "second and seven", aiSource: "own" });
    expect(calls.map((c) => c.url)).toEqual(["https://api.openai.com/v1/audio/transcriptions"]);
    expect(calls[0].headers.authorization).toBe(`Bearer ${OWN_KEY}`);
    const sent = calls[0].body as FormData;
    expect(sent.get("model")).toBe("gpt-transcribe");
    expect(sent.getAll("keywords")).toEqual(["Trips Right"]);
  });

  it("sends the clip to Google on a Gemini key, with the key in a header", async () => {
    const calls = mockFetch(() => Response.json({ candidates: [{ content: { parts: [{ text: " second and seven " }] } }] }));
    const handler = await loadHandler("transcribe");
    const res = await handler(clip({ aiProvider: "gemini", aiKey: OWN_KEY, aiModel: "gemini-2.5-flash" }));
    expect(await res.json()).toEqual({ text: "second and seven", aiSource: "own" });
    expect(calls.map((c) => c.url)).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    ]);
    expect(calls[0].url).not.toContain(OWN_KEY);
    expect(calls[0].headers["x-goog-api-key"]).toBe(OWN_KEY);
    const part = (calls[0].body as { contents: { parts: { inline_data?: { mime_type: string; data: string } }[] }[] })
      .contents[0].parts[0].inline_data;
    expect(part?.mime_type).toBe("audio/webm");
    expect(part?.data.length).toBe(4000); // 3000 bytes as base64
  });

  it("refuses a provider that cannot transcribe, or a model name that is not a plain name", async () => {
    const calls = mockFetch(() => Response.json({ text: "x" }));
    const handler = await loadHandler("transcribe");
    expect((await handler(clip({ aiProvider: "anthropic", aiKey: OWN_KEY, aiModel: "claude-haiku-5-5" }))).status).toBe(400);
    expect((await handler(clip({ aiProvider: "gemini", aiKey: OWN_KEY, aiModel: "x/../../y" }))).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("still requires sign-in when no key is sent", async () => {
    const calls = mockFetch(() => Response.json({ text: "x" }));
    const handler = await loadHandler("transcribe");
    expect((await handler(clip({}))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("tells the coach when the key is rejected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(() => new Response('{"error":{"message":"API key not valid"}}', { status: 400 }));
    const handler = await loadHandler("transcribe");
    const res = await handler(clip({ aiProvider: "gemini", aiKey: OWN_KEY, aiModel: "gemini-2.5-flash" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("AI setup");
  });
});
