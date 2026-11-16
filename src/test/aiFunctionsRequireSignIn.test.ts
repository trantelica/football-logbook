/**
 * The four AI functions spend paid credits and their address is public, so
 * each must refuse a caller that has no real user session before it does
 * anything else. This loads the actual function files with a stand-in for the
 * Deno runtime and drives the handlers directly.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const FUNCTIONS = ["transcribe", "ai-enrich", "ai-enrich-grades", "ai-enrich-personnel"] as const;
type Handler = (req: Request) => Promise<Response>;

const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "https://project.example",
  SUPABASE_ANON_KEY: "public-key",
};

async function loadHandler(name: string, env: Record<string, string>): Promise<Handler> {
  let handler: Handler | null = null;
  (globalThis as Record<string, unknown>).Deno = {
    env: { get: (k: string) => env[k] },
    serve: (h: Handler) => { handler = h; },
  };
  vi.resetModules();
  // Variable specifier on purpose: these files are Deno code and must stay out
  // of the app's type-check and bundle.
  const file = new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url).pathname;
  await import(/* @vite-ignore */ file);
  if (!handler) throw new Error(`${name} did not register a handler`);
  return handler;
}

function post(headers: Record<string, string> = {}): Request {
  return new Request("https://fn.example/", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: "{}",
  });
}

/** Stand-in for fetch: answers the auth lookup, fails loudly on anything else. */
function mockFetch(authResponse: () => Response) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://project.example/auth/v1/user") return authResponse();
    throw new Error(`unexpected outbound call to ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).Deno;
});

describe.each(FUNCTIONS)("%s requires a signed-in coach", (name) => {
  it("refuses a request with no Authorization header, without calling anything", async () => {
    const calls = mockFetch(() => new Response("{}", { status: 200 }));
    const res = await (await loadHandler(name, BASE_ENV))(post());
    expect(res.status).toBe(401);
    expect((await res.json()).errorCategory).toBe("auth");
    expect(calls).toEqual([]);
  });

  it("refuses the public key or any token the auth service rejects", async () => {
    const calls = mockFetch(() => new Response("{}", { status: 403 }));
    const res = await (await loadHandler(name, BASE_ENV))(post({ Authorization: "Bearer public-key" }));
    expect(res.status).toBe(401);
    // Only the auth lookup ran. The AI gateway was never reached.
    expect(calls).toEqual(["https://project.example/auth/v1/user"]);
  });

  it("refuses a signed-in account that is not on the allow-list", async () => {
    mockFetch(() => Response.json({ id: "user-1", email: "stranger@example.com" }));
    const handler = await loadHandler(name, { ...BASE_ENV, AI_ALLOWED_EMAILS: "coach@example.com, Other@Example.com" });
    const res = await handler(post({ Authorization: "Bearer session-token" }));
    expect(res.status).toBe(403);
  });

  it("lets a signed-in coach through the gate", async () => {
    mockFetch(() => Response.json({ id: "user-1", email: "Coach@Example.com" }));
    const handler = await loadHandler(name, { ...BASE_ENV, AI_ALLOWED_EMAILS: "coach@example.com" });
    const res = await handler(post({ Authorization: "Bearer session-token" }));
    // Past the gate, an empty body ends in each function's own handling
    // (no AI key is configured here), never in an auth refusal.
    expect([401, 403]).not.toContain(res.status);
  });

  it("fails closed when the sign-in check cannot be configured", async () => {
    mockFetch(() => Response.json({ id: "user-1" }));
    const res = await (await loadHandler(name, {}))(post({ Authorization: "Bearer session-token" }));
    expect(res.status).toBe(500);
  });

  it("still answers the browser preflight without a session", async () => {
    mockFetch(() => new Response("{}", { status: 403 }));
    const res = await (await loadHandler(name, BASE_ENV))(new Request("https://fn.example/", { method: "OPTIONS" }));
    expect(res.status).toBe(200);
  });
});
