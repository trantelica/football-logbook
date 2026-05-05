/**
 * AI actor candidate eligibility — Play Results only.
 *
 * Verifies that rusher/passer/receiver may be AI-proposed when the active
 * section is playResults and the deterministic parser left them blank, with
 * strict integer coercion, contamination guards, no overwrite, and section
 * scoping.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { filterAiProposal } from "../engine/aiEnrichment";
import {
  AI_ELIGIBLE_FIELDS,
  PLAY_RESULTS_ACTOR_FIELDS,
} from "../engine/aiEligibility";
import type { CandidateData } from "../engine/types";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

function cand(overrides: Record<string, unknown> = {}): CandidateData {
  return { gameId: "g1", ...overrides } as CandidateData;
}

describe("AI actor eligibility constants", () => {
  it("rusher/passer/receiver are AI-eligible", () => {
    expect(AI_ELIGIBLE_FIELDS.has("rusher")).toBe(true);
    expect(AI_ELIGIBLE_FIELDS.has("passer")).toBe(true);
    expect(AI_ELIGIBLE_FIELDS.has("receiver")).toBe(true);
    expect(PLAY_RESULTS_ACTOR_FIELDS.has("rusher")).toBe(true);
    expect(PLAY_RESULTS_ACTOR_FIELDS.has("passer")).toBe(true);
    expect(PLAY_RESULTS_ACTOR_FIELDS.has("receiver")).toBe(true);
  });
});

describe("filterAiProposal — actor fields", () => {
  it("accepts integer rusher when result=Rush and field unresolved", () => {
    const { safePatch, collisions } = filterAiProposal({
      proposal: { result: "Rush", gainLoss: 8, rusher: 4 },
      unresolvedFields: new Set(["result", "gainLoss", "rusher"]),
      candidate: cand(),
    });
    expect(safePatch).toEqual({ result: "Rush", gainLoss: 8, rusher: 4 });
    expect(collisions).toHaveLength(0);
  });

  it("coerces digit-string jersey to integer", () => {
    const { safePatch } = filterAiProposal({
      proposal: { rusher: "4" },
      unresolvedFields: new Set(["rusher"]),
      candidate: cand({ result: "Rush" }),
    });
    expect(safePatch).toEqual({ rusher: 4 });
  });

  it("drops non-integer rusher proposals like 'four' or 'RB4'", () => {
    const { safePatch, collisions } = filterAiProposal({
      proposal: { rusher: "four" },
      unresolvedFields: new Set(["rusher"]),
      candidate: cand({ result: "Rush" }),
    });
    expect(safePatch).toEqual({});
    expect(collisions).toHaveLength(0);

    const r2 = filterAiProposal({
      proposal: { rusher: "RB4" },
      unresolvedFields: new Set(["rusher"]),
      candidate: cand({ result: "Rush" }),
    });
    expect(r2.safePatch).toEqual({});
  });

  it("drops out-of-range / non-positive jerseys", () => {
    for (const v of [0, -1, 100, 1.5, "0", "100"]) {
      const { safePatch } = filterAiProposal({
        proposal: { rusher: v },
        unresolvedFields: new Set(["rusher"]),
        candidate: cand({ result: "Rush" }),
      });
      expect(safePatch).toEqual({});
    }
  });

  it("does not overwrite an already-filled rusher", () => {
    const { safePatch, collisions } = filterAiProposal({
      proposal: { rusher: 7 },
      unresolvedFields: new Set(), // already resolved
      candidate: cand({ rusher: 4 }),
    });
    expect(safePatch).toEqual({});
    expect(collisions).toHaveLength(1);
    expect(collisions[0].fieldName).toBe("rusher");
  });

  it("contamination guard: drops rusher when result is Complete/Sack/Penalty/etc.", () => {
    for (const result of ["Complete", "Incomplete", "Sack", "Penalty", "Interception"]) {
      const { safePatch } = filterAiProposal({
        proposal: { rusher: 4 },
        unresolvedFields: new Set(["rusher"]),
        candidate: cand({ result }),
      });
      expect(safePatch, `result=${result}`).toEqual({});
    }
  });

  it("contamination guard: passer/receiver are NOT dropped on pass results", () => {
    const { safePatch } = filterAiProposal({
      proposal: { passer: 4, receiver: 8 },
      unresolvedFields: new Set(["passer", "receiver"]),
      candidate: cand({ result: "Complete" }),
    });
    expect(safePatch).toEqual({ passer: 4, receiver: 8 });
  });

  it("contamination guard uses proposed result if candidate result is empty", () => {
    const { safePatch } = filterAiProposal({
      proposal: { result: "Sack", rusher: 4 },
      unresolvedFields: new Set(["result", "rusher"]),
      candidate: cand(),
    });
    expect(safePatch).toEqual({ result: "Sack" });
    expect(safePatch).not.toHaveProperty("rusher");
  });

  it("rusher allowed for Rush variants, Scramble, Fumble, etc.", () => {
    for (const result of ["Rush", "Rush, TD", "Rush, Safety", "Scramble", "Fumble", "1st DN"]) {
      const { safePatch } = filterAiProposal({
        proposal: { rusher: 4 },
        unresolvedFields: new Set(["rusher"]),
        candidate: cand({ result }),
      });
      expect(safePatch, `result=${result}`).toEqual({ rusher: 4 });
    }
  });
});

describe("fetchAiProposal — section-scoped actor eligibility", () => {
  beforeEach(() => invokeMock.mockReset());

  const baseOpts = {
    observationText: "the ball was carried for 8 yards by number 4",
    deterministicPatch: {},
  };

  it("playResults: actor fields included in unresolvedFields and accepted in response", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { proposal: { result: "Rush", gainLoss: 8, rusher: 4 } },
      error: null,
    });
    const { fetchAiProposal } = await import("../engine/aiEnrichClient");
    const result = await fetchAiProposal({ gameId: "g1" }, 1, {
      ...baseOpts,
      activeSection: "playResults",
    });
    const body = invokeMock.mock.calls[0][1].body as { unresolvedFields: string[] };
    expect(body.unresolvedFields).toContain("rusher");
    expect(body.unresolvedFields).toContain("passer");
    expect(body.unresolvedFields).toContain("receiver");
    expect(result.proposal).toMatchObject({ result: "Rush", gainLoss: 8, rusher: 4 });
  });

  it("playDetails: actor fields excluded from unresolvedFields and dropped from response", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { proposal: { rusher: 4, passer: 7, offForm: { value: "Shiny", matchType: "exact" } } },
      error: null,
    });
    const { fetchAiProposal } = await import("../engine/aiEnrichClient");
    const result = await fetchAiProposal({ gameId: "g1" }, 1, {
      ...baseOpts,
      activeSection: "playDetails",
    });
    const body = invokeMock.mock.calls[0][1].body as { unresolvedFields: string[] };
    expect(body.unresolvedFields).not.toContain("rusher");
    expect(body.unresolvedFields).not.toContain("passer");
    expect(body.unresolvedFields).not.toContain("receiver");
    expect(result.proposal).not.toHaveProperty("rusher");
    expect(result.proposal).not.toHaveProperty("passer");
    expect(result.proposal).not.toHaveProperty("receiver");
  });

  it("legacy (no activeSection): actor fields are dropped from request and response", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { proposal: { rusher: 4, result: "Rush" } },
      error: null,
    });
    const { fetchAiProposal } = await import("../engine/aiEnrichClient");
    const result = await fetchAiProposal({ gameId: "g1" }, 1, baseOpts);
    const body = invokeMock.mock.calls[0][1].body as { unresolvedFields: string[] };
    expect(body.unresolvedFields).not.toContain("rusher");
    expect(result.proposal).not.toHaveProperty("rusher");
    expect(result.proposal).toHaveProperty("result");
  });

  it("playResults: passer + receiver pair flow through", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { proposal: { result: "Complete", passer: 4, receiver: 8 } },
      error: null,
    });
    const { fetchAiProposal } = await import("../engine/aiEnrichClient");
    const result = await fetchAiProposal({ gameId: "g1" }, 1, {
      ...baseOpts,
      observationText: "number 4 throws complete to number 8",
      activeSection: "playResults",
    });
    expect(result.proposal).toMatchObject({ result: "Complete", passer: 4, receiver: 8 });
  });
});
