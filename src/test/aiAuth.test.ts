import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: () => getSession() } },
}));

import { isSignedInForAi } from "@/engine/aiAuth";

describe("isSignedInForAi", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("is false when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    expect(await isSignedInForAi()).toBe(false);
  });

  it("is true when a session exists", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
    expect(await isSignedInForAi()).toBe(true);
  });

  it("defers to the server when the session cannot be read", async () => {
    getSession.mockRejectedValue(new Error("storage unavailable"));
    expect(await isSignedInForAi()).toBe(true);
  });
});
