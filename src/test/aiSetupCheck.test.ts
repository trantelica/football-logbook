import { describe, it, expect, vi, beforeEach } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";

const invoke = vi.fn();
const getSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, auth: { getSession: () => getSession() } },
}));

import { checkAiSetup } from "@/engine/aiSetupCheck";
import { resolveAiAccess } from "@/engine/aiAuth";
import { saveAiSetup } from "@/engine/aiSetup";

const config = { provider: "gemini" as const, apiKey: "test-own-key-0123456789", model: "gemini-2.5-flash" };
const refused = (status: number, body: unknown) =>
  ({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify(body), { status })) });

beforeEach(() => {
  invoke.mockReset();
  getSession.mockReset();
  localStorage.clear();
});

describe("checkAiSetup", () => {
  it("passes when the coach's own key read the sample play", async () => {
    invoke.mockResolvedValue({ data: { proposal: { result: "Rush", gainLoss: 4 }, aiSource: "own" }, error: null });
    expect(await checkAiSetup(config)).toEqual({ ok: true, reading: "Result: Rush, Gain: 4" });
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe("ai-enrich");
    expect(opts.body.aiConfig).toEqual(config);
    expect(opts.body.unresolvedFields).toEqual(["result", "gainLoss"]);
    expect(opts.body.fieldHints.result.allowedValues).toContain("Rush");
  });

  it("does not pass when an older AI service answered with the built-in AI", async () => {
    invoke.mockResolvedValue({ data: { proposal: { result: "Rush" } }, error: null });
    expect(await checkAiSetup(config)).toMatchObject({ ok: false, reason: "app" });
    invoke.mockResolvedValue(refused(401, { error: "Sign in", errorCategory: "auth" }));
    expect(await checkAiSetup(config)).toMatchObject({ ok: false, reason: "app" });
  });

  it.each([
    ["key_rejected", "key"],
    ["credits_exhausted", "credit"],
    ["rate_limited", "limit"],
    ["model_unavailable", "model"],
    ["model_error", "model"],
  ])("turns %s into a %s problem", async (errorCategory, reason) => {
    invoke.mockResolvedValue(refused(400, { error: "x", errorCategory }));
    expect(await checkAiSetup(config)).toMatchObject({ ok: false, reason });
  });

  it("reports an unreachable AI service as a connection problem", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Failed to send a request to the Edge Function") });
    expect(await checkAiSetup(config)).toMatchObject({ ok: false, reason: "network" });
    invoke.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await checkAiSetup(config)).toMatchObject({ ok: false, reason: "network" });
  });
});

describe("resolveAiAccess", () => {
  it("uses a registered key without needing a sign-in", async () => {
    saveAiSetup(config);
    expect(await resolveAiAccess()).toEqual({ allowed: true, aiConfig: config });
    expect(getSession).not.toHaveBeenCalled();
  });

  it("falls back to built-in AI for a signed-in coach with no key", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
    expect(await resolveAiAccess()).toEqual({ allowed: true, aiConfig: null });
  });

  it("is not allowed with neither a key nor a sign-in", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    expect(await resolveAiAccess()).toEqual({ allowed: false, aiConfig: null });
  });
});
