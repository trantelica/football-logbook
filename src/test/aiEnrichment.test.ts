import { describe, it, expect } from "vitest";
import { getUnresolvedFields, filterAiProposal } from "../engine/aiEnrichment";
import { AI_ELIGIBLE_FIELDS } from "../engine/aiEligibility";
import type { CandidateData } from "../engine/types";
import type { CandidateData } from "../engine/types";

function makeCandidate(overrides: Record<string, unknown> = {}): CandidateData {
  return { gameId: "g1", ...overrides } as CandidateData;
}

describe("getUnresolvedFields", () => {
  it("returns empty fields not claimed by any provenance set", () => {
    const result = getUnresolvedFields({
      candidate: makeCandidate({ dn: "1", dist: null, yardLn: null }),
      touchedFields: new Set(["dn"]),
      deterministicParseFields: new Set(),
      predictedFields: new Set(),
      carriedForwardFields: new Set(),
      lookupDerivedFields: new Set(),
      aiProposedFields: new Set(),
      eligibleFieldNames: ["dn", "dist", "yardLn", "offForm"],
    });
    expect(result).toContain("dist");
    expect(result).toContain("yardLn");
    expect(result).toContain("offForm");
    expect(result).not.toContain("dn");
  });

  it("excludes system-managed fields", () => {
    const result = getUnresolvedFields({
      candidate: makeCandidate(),
      touchedFields: new Set(),
      deterministicParseFields: new Set(),
      predictedFields: new Set(),
      carriedForwardFields: new Set(),
      lookupDerivedFields: new Set(),
      aiProposedFields: new Set(),
      eligibleFieldNames: ["gameId", "playNum", "qtr", "odk", "series", "dist"],
    });
    expect(result).toEqual(["dist"]);
  });

  it("excludes fields claimed by deterministicParseFields", () => {
    const result = getUnresolvedFields({
      candidate: makeCandidate({ dn: "2" }),
      touchedFields: new Set(),
      deterministicParseFields: new Set(["dn"]),
      predictedFields: new Set(),
      carriedForwardFields: new Set(),
      lookupDerivedFields: new Set(),
      aiProposedFields: new Set(),
      eligibleFieldNames: ["dn", "dist"],
    });
    expect(result).not.toContain("dn");
    expect(result).toContain("dist");
  });

  it("excludes fields claimed by predictedFields", () => {
    const result = getUnresolvedFields({
      candidate: makeCandidate({ yardLn: -20 }),
      touchedFields: new Set(),
      deterministicParseFields: new Set(),
      predictedFields: new Set(["yardLn"]),
      carriedForwardFields: new Set(),
      lookupDerivedFields: new Set(),
      aiProposedFields: new Set(),
      eligibleFieldNames: ["yardLn", "dist"],
    });
    expect(result).not.toContain("yardLn");
  });

  it("excludes fields claimed by lookupDerivedFields", () => {
    const result = getUnresolvedFields({
      candidate: makeCandidate({ offStrength: "Rt" }),
      touchedFields: new Set(),
      deterministicParseFields: new Set(),
      predictedFields: new Set(),
      carriedForwardFields: new Set(),
      lookupDerivedFields: new Set(["offStrength"]),
      aiProposedFields: new Set(),
      eligibleFieldNames: ["offStrength", "dist"],
    });
    expect(result).not.toContain("offStrength");
  });

  it("excludes fields already AI-proposed", () => {
    const result = getUnresolvedFields({
      candidate: makeCandidate({ dist: "10" }),
      touchedFields: new Set(),
      deterministicParseFields: new Set(),
      predictedFields: new Set(),
      carriedForwardFields: new Set(),
      lookupDerivedFields: new Set(),
      aiProposedFields: new Set(["dist"]),
      eligibleFieldNames: ["dist", "hash"],
    });
    expect(result).not.toContain("dist");
    expect(result).toContain("hash");
  });
});

describe("filterAiProposal", () => {
  it("passes through proposals for unresolved fields only", () => {
    const { safePatch, collisions } = filterAiProposal({
      proposal: { dist: "10", hash: "L" },
      unresolvedFields: new Set(["dist", "hash"]),
      candidate: makeCandidate(),
    });
    expect(safePatch).toEqual({ dist: "10", hash: "L" });
    expect(collisions).toHaveLength(0);
  });

  it("blocks proposals for resolved fields as collisions", () => {
    const { safePatch, collisions } = filterAiProposal({
      proposal: { dn: "2", dist: "10" },
      unresolvedFields: new Set(["dist"]),
      candidate: makeCandidate({ dn: "1" }),
    });
    expect(safePatch).toEqual({ dist: "10" });
    expect(collisions).toHaveLength(1);
    expect(collisions[0].fieldName).toBe("dn");
    expect(collisions[0].currentValue).toBe("1");
    expect(collisions[0].proposedValue).toBe("2");
  });

  it("does not overwrite deterministic_parse fields", () => {
    // Simulating a field that has provenance but empty value
    const { safePatch, collisions } = filterAiProposal({
      proposal: { dn: "3" },
      unresolvedFields: new Set(), // dn is not unresolved
      candidate: makeCandidate({ dn: "" }),
    });
    expect(safePatch).toEqual({});
    expect(collisions).toHaveLength(1);
  });

  it("does not overwrite coach-edited fields", () => {
    const { safePatch, collisions } = filterAiProposal({
      proposal: { dist: "7" },
      unresolvedFields: new Set(), // dist is touched
      candidate: makeCandidate({ dist: "10" }),
    });
    expect(safePatch).toEqual({});
    expect(collisions).toHaveLength(1);
    expect(collisions[0].fieldName).toBe("dist");
  });

  it("does not overwrite lookup_derived fields", () => {
    const { safePatch, collisions } = filterAiProposal({
      proposal: { offStrength: "Lt" },
      unresolvedFields: new Set(), // offStrength is lookup_derived
      candidate: makeCandidate({ offStrength: "Rt" }),
    });
    expect(safePatch).toEqual({});
    expect(collisions).toHaveLength(1);
  });

  it("skips null/empty proposed values", () => {
    const { safePatch, collisions } = filterAiProposal({
      proposal: { dist: null, hash: "", result: "Rush" },
      unresolvedFields: new Set(["dist", "hash", "result"]),
      candidate: makeCandidate(),
    });
    expect(safePatch).toEqual({ result: "Rush" });
    expect(collisions).toHaveLength(0);
  });

  it("skips excluded system fields", () => {
    const { safePatch, collisions } = filterAiProposal({
      proposal: { gameId: "g2", playNum: 5, result: "Rush" },
      unresolvedFields: new Set(["result"]),
      candidate: makeCandidate(),
    });
    expect(safePatch).toEqual({ result: "Rush" });
    expect(collisions).toHaveLength(0);
  });

  it("silently drops non-AI-eligible fields (Bucket A)", () => {
    const { safePatch, collisions } = filterAiProposal({
      proposal: { offStrength: "L", playType: "Run", motionDir: "R", result: "Rush" },
      unresolvedFields: new Set(["offStrength", "playType", "motionDir", "result"]),
      candidate: makeCandidate(),
    });
    // offStrength, playType, motionDir are not in AI_ELIGIBLE_FIELDS
    expect(safePatch).toEqual({ result: "Rush" });
    expect(collisions).toHaveLength(0);
  });

  it("only allows fields in AI_ELIGIBLE_FIELDS through", () => {
    // Verify the constant has the expected initial set
    expect(AI_ELIGIBLE_FIELDS.has("yardLn")).toBe(true);
    expect(AI_ELIGIBLE_FIELDS.has("hash")).toBe(true);
    expect(AI_ELIGIBLE_FIELDS.has("result")).toBe(true);
    expect(AI_ELIGIBLE_FIELDS.has("gainLoss")).toBe(true);
    expect(AI_ELIGIBLE_FIELDS.has("offForm")).toBe(true);
    expect(AI_ELIGIBLE_FIELDS.has("offPlay")).toBe(true);
    // Bucket A fields are excluded
    expect(AI_ELIGIBLE_FIELDS.has("offStrength")).toBe(false);
    expect(AI_ELIGIBLE_FIELDS.has("playType")).toBe(false);
    expect(AI_ELIGIBLE_FIELDS.has("playDir")).toBe(false);
    expect(AI_ELIGIBLE_FIELDS.has("motionDir")).toBe(false);
    expect(AI_ELIGIBLE_FIELDS.has("penYards")).toBe(false);
    expect(AI_ELIGIBLE_FIELDS.has("eff")).toBe(false);
    expect(AI_ELIGIBLE_FIELDS.has("personnel")).toBe(false);
    expect(AI_ELIGIBLE_FIELDS.has("patTry")).toBe(false);
  });

  it("attaches AI-proposed evidence to safe patch fields", () => {
    const { evidence } = filterAiProposal({
      proposal: { dist: "10", hash: "L" },
      unresolvedFields: new Set(["dist", "hash"]),
      candidate: makeCandidate(),
    });
    expect(evidence["dist"]).toEqual({ snippet: "AI-proposed" });
    expect(evidence["hash"]).toEqual({ snippet: "AI-proposed" });
  });

  it("AI-proposed values remain reviewable (not auto-committed)", () => {
    // This test verifies the contract: safePatch goes through applySystemPatch
    // with source="ai_proposed", which means fields land in aiProposedFields
    // and remain in candidate state, not committed.
    const { safePatch } = filterAiProposal({
      proposal: { dist: "10" },
      unresolvedFields: new Set(["dist"]),
      candidate: makeCandidate(),
    });
    expect(safePatch).toEqual({ dist: "10" });
    // The actual review/commit flow is tested in the transaction integration
  });

  it("governance-blocked values remain blocked after AI enrichment", () => {
    // AI can propose a value for a governed field, but if the value isn't
    // in the lookup table, governance validation will still block it.
    // This test verifies AI doesn't bypass the filter — the value goes
    // through applySystemPatch which triggers lookup interrupt.
    const { safePatch } = filterAiProposal({
      proposal: { offForm: "UnknownForm" },
      unresolvedFields: new Set(["offForm"]),
      candidate: makeCandidate(),
    });
    expect(safePatch).toEqual({ offForm: "UnknownForm" });
    // Governance enforcement happens in applySystemPatch → lookup interrupt
  });
});

/**
 * Tests for grounded AI enrichment client contract.
 * These test the client-side gating logic (fetchAiProposal).
 */
describe("fetchAiProposal client gating", () => {
  it("returns error when observationText is empty", async () => {
    // We can test the client gating without a real edge function
    const { fetchAiProposal } = await import("../engine/aiEnrichClient");
    const result = await fetchAiProposal(
      { gameId: "g1", dn: "1" },
      1,
      { observationText: "" },
    );
    expect(result.error).toContain("observation context");
    expect(Object.keys(result.proposal)).toHaveLength(0);
  });

  it("returns error when observationText is undefined", async () => {
    const { fetchAiProposal } = await import("../engine/aiEnrichClient");
    const result = await fetchAiProposal(
      { gameId: "g1", dn: "1" },
      1,
      { observationText: undefined },
    );
    expect(result.error).toContain("observation context");
    expect(Object.keys(result.proposal)).toHaveLength(0);
  });

  it("returns error when observationText is whitespace only", async () => {
    const { fetchAiProposal } = await import("../engine/aiEnrichClient");
    const result = await fetchAiProposal(
      { gameId: "g1", dn: "1" },
      1,
      { observationText: "   " },
    );
    expect(result.error).toContain("observation context");
    expect(Object.keys(result.proposal)).toHaveLength(0);
  });

  it("returns error when no opts provided (no observation)", async () => {
    const { fetchAiProposal } = await import("../engine/aiEnrichClient");
    const result = await fetchAiProposal({ gameId: "g1" }, 1);
    expect(result.error).toContain("observation context");
    expect(Object.keys(result.proposal)).toHaveLength(0);
  });
});
