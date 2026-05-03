import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAiProposal } from "../engine/aiEnrichClient";
import type { ParserSuspicionReport } from "../engine/parserSuspicion";
import type { CandidateData } from "../engine/types";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

function candidate(): CandidateData {
  return { gameId: "g1" } as CandidateData;
}

const LOOKUP = new Map<string, string[]>([
  ["offForm", ["Shiny", "Black"]],
  ["offPlay", ["39 Reverse Pass", "26 Punch"]],
  ["motion", ["Z Jet"]],
]);

function suspicion(fields: Record<string, { observedValue: string; codes: string[]; scannerCanonical?: string }>): ParserSuspicionReport {
  const perField: ParserSuspicionReport["perField"] = {};
  for (const [k, v] of Object.entries(fields)) {
    perField[k as "offForm" | "offPlay" | "motion"] = {
      fieldName: k as "offForm" | "offPlay" | "motion",
      observedValue: v.observedValue,
      codes: v.codes as never,
      ...(v.scannerCanonical ? { scannerCanonical: v.scannerCanonical } : {}),
      evidence: {},
    };
  }
  return { perField, signals: Object.values(perField) };
}

beforeEach(() => {
  invokeMock.mockReset();
});

describe("aiCorrections — request shape", () => {
  it("1. no suspicion → suspectFields not sent and corrections absent", async () => {
    invokeMock.mockResolvedValue({ data: { proposal: {} }, error: null });
    await fetchAiProposal(candidate(), 1, {
      observationText: "blah",
      activeSection: "playDetails",
      lookupValues: LOOKUP,
    });
    const body = invokeMock.mock.calls[0][1].body;
    expect(body.suspectFields).toBeUndefined();
    expect(body.suspicionEvidence).toBeUndefined();
  });

  it("2. suspicion outside playDetails is dropped (no suspectFields sent)", async () => {
    invokeMock.mockResolvedValue({ data: { proposal: {} }, error: null });
    await fetchAiProposal(candidate(), 1, {
      observationText: "blah",
      activeSection: "situation",
      lookupValues: LOOKUP,
      parserPatch: { offForm: "Pass From Shiny" },
      parserSuspicion: suspicion({
        offForm: { observedValue: "Pass From Shiny", codes: ["connector_absorbed"] },
      }),
    });
    const body = invokeMock.mock.calls[0][1].body;
    expect(body.suspectFields).toBeUndefined();
  });

  it("Play Details suspicion → suspectFields sent with evidence", async () => {
    invokeMock.mockResolvedValue({ data: { proposal: {} }, error: null });
    await fetchAiProposal(candidate(), 1, {
      observationText: "The play is 39 Reverse Pass from Shiny formation.",
      activeSection: "playDetails",
      lookupValues: LOOKUP,
      parserPatch: { offForm: "Pass From Shiny", offPlay: "39 Reverse" },
      parserSuspicion: suspicion({
        offForm: { observedValue: "Pass From Shiny", codes: ["connector_absorbed"] },
        offPlay: { observedValue: "39 Reverse", codes: ["scanner_conflict"], scannerCanonical: "39 Reverse Pass" },
      }),
    });
    const body = invokeMock.mock.calls[0][1].body;
    expect(body.suspectFields.sort()).toEqual(["offForm", "offPlay"]);
    expect(body.suspicionEvidence.offPlay.scannerCanonical).toBe("39 Reverse Pass");
  });
});

describe("aiCorrections — response filtering", () => {
  function call(extra: Record<string, unknown> = {}, parserPatch: Record<string, unknown> = { offForm: "Pass From Shiny", offPlay: "39 Reverse" }) {
    return fetchAiProposal(candidate(), 1, {
      observationText: "x",
      activeSection: "playDetails",
      lookupValues: LOOKUP,
      parserPatch,
      parserSuspicion: suspicion({
        offForm: { observedValue: "Pass From Shiny", codes: ["connector_absorbed"] },
        offPlay: { observedValue: "39 Reverse", codes: ["scanner_conflict"] },
      }),
      ...extra,
    });
  }

  it("3. correction for field not in suspectFields is dropped", async () => {
    invokeMock.mockResolvedValue({
      data: {
        proposal: {},
        // motion is NOT in suspectFields (not flagged)
        corrections: { motion: { value: "Z Jet", matchType: "exact" } },
      },
      error: null,
    });
    const r = await call();
    expect(r.corrections).toBeUndefined();
  });

  it("4. correction for non-allowlisted field (e.g. result) is dropped", async () => {
    invokeMock.mockResolvedValue({
      data: {
        proposal: {},
        corrections: { result: { value: "Complete", matchType: "exact" } },
      },
      error: null,
    });
    const r = await call();
    expect(r.corrections).toBeUndefined();
  });

  it("5. correction equal to parser value is dropped", async () => {
    invokeMock.mockResolvedValue({
      data: {
        proposal: {},
        corrections: { offForm: { value: "pass from shiny", matchType: "exact" } },
      },
      error: null,
    });
    const r = await call();
    expect(r.corrections).toBeUndefined();
  });

  it("6. valid offForm correction surfaces in corrections, NOT in proposal", async () => {
    invokeMock.mockResolvedValue({
      data: {
        proposal: {},
        corrections: { offForm: { value: "Shiny", matchType: "exact" } },
      },
      error: null,
    });
    const r = await call();
    expect(r.corrections?.offForm?.value).toBe("Shiny");
    expect(r.corrections?.offForm?.matchType).toBe("exact");
    expect(r.proposal.offForm).toBeUndefined();
  });

  it("7. candidate_new governed correction preserves shape for governance", async () => {
    invokeMock.mockResolvedValue({
      data: {
        proposal: {},
        corrections: { offForm: { value: "Purple", matchType: "candidate_new" } },
      },
      error: null,
    });
    const r = await call();
    expect(r.corrections?.offForm).toEqual(
      expect.objectContaining({ value: "Purple", matchType: "candidate_new" }),
    );
  });

  it("8. fixture: 39 Reverse Pass / Shiny — both corrections returned, proposal empty", async () => {
    invokeMock.mockResolvedValue({
      data: {
        proposal: {},
        corrections: {
          offPlay: { value: "39 Reverse Pass", matchType: "exact" },
          offForm: { value: "Shiny", matchType: "exact" },
        },
      },
      error: null,
    });
    const r = await call();
    expect(r.corrections?.offPlay?.value).toBe("39 Reverse Pass");
    expect(r.corrections?.offForm?.value).toBe("Shiny");
    expect(r.proposal.offPlay).toBeUndefined();
    expect(r.proposal.offForm).toBeUndefined();
  });

  it("malformed correction (missing matchType) is dropped", async () => {
    invokeMock.mockResolvedValue({
      data: {
        proposal: {},
        corrections: { offForm: { value: "Shiny" } },
      },
      error: null,
    });
    const r = await call();
    expect(r.corrections).toBeUndefined();
  });
});
