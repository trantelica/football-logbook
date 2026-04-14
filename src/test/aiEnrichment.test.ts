import { describe, it, expect } from "vitest";
import { getUnresolvedFields, filterAiProposal, isGovernedProposal } from "../engine/aiEnrichment";
import { AI_ELIGIBLE_FIELDS } from "../engine/aiEligibility";
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
      proposal: { result: "Rush", hash: "L" },
      unresolvedFields: new Set(["result", "hash"]),
      candidate: makeCandidate(),
    });
    expect(safePatch).toEqual({ result: "Rush", hash: "L" });
    expect(collisions).toHaveLength(0);
  });

  it("blocks proposals for resolved fields as collisions", () => {
    const { safePatch, collisions } = filterAiProposal({
      proposal: { hash: "R", result: "Rush" },
      unresolvedFields: new Set(["result"]),
      candidate: makeCandidate({ hash: "L" }),
    });
    expect(safePatch).toEqual({ result: "Rush" });
    expect(collisions).toHaveLength(1);
    expect(collisions[0].fieldName).toBe("hash");
    expect(collisions[0].currentValue).toBe("L");
    expect(collisions[0].proposedValue).toBe("R");
  });

  it("does not overwrite deterministic_parse fields", () => {
    // result has provenance but empty value — still a collision
    const { safePatch, collisions } = filterAiProposal({
      proposal: { result: "Rush" },
      unresolvedFields: new Set(), // result is not unresolved
      candidate: makeCandidate({ result: "" }),
    });
    expect(safePatch).toEqual({});
    expect(collisions).toHaveLength(1);
  });

  it("does not overwrite coach-edited fields", () => {
    const { safePatch, collisions } = filterAiProposal({
      proposal: { gainLoss: 7 },
      unresolvedFields: new Set(), // gainLoss is touched
      candidate: makeCandidate({ gainLoss: 10 }),
    });
    expect(safePatch).toEqual({});
    expect(collisions).toHaveLength(1);
    expect(collisions[0].fieldName).toBe("gainLoss");
  });

  it("does not overwrite lookup_derived fields (non-eligible silently dropped)", () => {
    // offStrength is not in AI_ELIGIBLE_FIELDS, so it's silently dropped
    const { safePatch, collisions } = filterAiProposal({
      proposal: { offStrength: "Lt" },
      unresolvedFields: new Set(), // offStrength is lookup_derived
      candidate: makeCandidate({ offStrength: "Rt" }),
    });
    expect(safePatch).toEqual({});
    expect(collisions).toHaveLength(0); // silently dropped, not a collision
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

  it("preserves exact matchType in evidence for governed fields", () => {
    const { safePatch, evidence, collisions } = filterAiProposal({
      proposal: { offForm: { value: "Shotgun Trips", matchType: "exact" } },
      unresolvedFields: new Set(["offForm"]),
      candidate: makeCandidate(),
    });
    expect(safePatch).toEqual({ offForm: "Shotgun Trips" });
    expect(evidence["offForm"].matchType).toBe("exact");
    expect(evidence["offForm"].snippet).toBe("AI-proposed");
    expect(collisions).toHaveLength(0);
  });

  it("preserves fuzzy matchType in evidence for governed fields", () => {
    const { safePatch, evidence } = filterAiProposal({
      proposal: { offPlay: { value: "24 Dive", matchType: "fuzzy" } },
      unresolvedFields: new Set(["offPlay"]),
      candidate: makeCandidate(),
    });
    expect(safePatch).toEqual({ offPlay: "24 Dive" });
    expect(evidence["offPlay"].matchType).toBe("fuzzy");
    expect(evidence["offPlay"].snippet).toBe("AI-proposed");
  });

  it("preserves candidate_new matchType in evidence for governed fields", () => {
    const { safePatch, evidence } = filterAiProposal({
      proposal: { offForm: { value: "Purple", matchType: "candidate_new" } },
      unresolvedFields: new Set(["offForm"]),
      candidate: makeCandidate(),
    });
    expect(safePatch).toEqual({ offForm: "Purple" });
    expect(evidence["offForm"].matchType).toBe("candidate_new");
    expect(evidence["offForm"].snippet).toBe("AI-proposed");
  });

  it("candidate_new values pass through safePatch for lookup governance", () => {
    // candidate_new must not be blocked by filterAiProposal — it reaches
    // applySystemPatch which triggers lookupInterruptPending for unknown values
    const { safePatch, collisions } = filterAiProposal({
      proposal: { offForm: { value: "NewFormation", matchType: "candidate_new" } },
      unresolvedFields: new Set(["offForm"]),
      candidate: makeCandidate(),
    });
    expect(safePatch["offForm"]).toBe("NewFormation");
    expect(collisions).toHaveLength(0);
  });

  it("non-governed fields have no matchType in evidence", () => {
    const { evidence } = filterAiProposal({
      proposal: { result: "Rush", hash: "L" },
      unresolvedFields: new Set(["result", "hash"]),
      candidate: makeCandidate(),
    });
    expect(evidence["result"].matchType).toBeUndefined();
    expect(evidence["hash"].matchType).toBeUndefined();
    expect(evidence["result"].snippet).toBe("AI-proposed");
  });

  it("mixed governed and plain proposals preserve respective metadata", () => {
    const { safePatch, evidence } = filterAiProposal({
      proposal: {
        offForm: { value: "Shotgun", matchType: "exact" },
        result: "Rush",
        hash: "L",
      },
      unresolvedFields: new Set(["offForm", "result", "hash"]),
      candidate: makeCandidate(),
    });
    expect(safePatch).toEqual({ offForm: "Shotgun", result: "Rush", hash: "L" });
    expect(evidence["offForm"].matchType).toBe("exact");
    expect(evidence["result"].matchType).toBeUndefined();
  });

  it("attaches AI-proposed evidence to safe patch fields", () => {
    const { evidence } = filterAiProposal({
      proposal: { result: "Rush", hash: "L" },
      unresolvedFields: new Set(["result", "hash"]),
      candidate: makeCandidate(),
    });
    expect(evidence["result"]).toEqual({ snippet: "AI-proposed" });
    expect(evidence["hash"]).toEqual({ snippet: "AI-proposed" });
  });

  it("AI-proposed values remain reviewable (not auto-committed)", () => {
    const { safePatch } = filterAiProposal({
      proposal: { result: "Rush" },
      unresolvedFields: new Set(["result"]),
      candidate: makeCandidate(),
    });
    expect(safePatch).toEqual({ result: "Rush" });
  });

  it("governance-blocked values remain blocked after AI enrichment", () => {
    const { safePatch } = filterAiProposal({
      proposal: { offForm: { value: "UnknownForm", matchType: "candidate_new" } },
      unresolvedFields: new Set(["offForm"]),
      candidate: makeCandidate(),
    });
    expect(safePatch).toEqual({ offForm: "UnknownForm" });
    // Governance enforcement happens in applySystemPatch → lookup interrupt
  });
});

describe("isGovernedProposal", () => {
  it("recognizes valid governed proposals", () => {
    expect(isGovernedProposal({ value: "Shotgun", matchType: "exact" })).toBe(true);
    expect(isGovernedProposal({ value: "Gun Trips", matchType: "fuzzy" })).toBe(true);
    expect(isGovernedProposal({ value: "Purple", matchType: "candidate_new" })).toBe(true);
  });

  it("rejects non-governed shapes", () => {
    expect(isGovernedProposal("Shotgun")).toBe(false);
    expect(isGovernedProposal(42)).toBe(false);
    expect(isGovernedProposal(null)).toBe(false);
    expect(isGovernedProposal({ value: "X" })).toBe(false);
    expect(isGovernedProposal({ matchType: "exact" })).toBe(false);
    expect(isGovernedProposal({ value: "X", matchType: "invalid" })).toBe(false);
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
