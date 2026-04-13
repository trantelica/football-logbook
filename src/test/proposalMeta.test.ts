import { describe, it, expect } from "vitest";
import { computeProposalMeta, type ProvenanceSource, type FieldStatus } from "../engine/proposalMeta";

function makeMeta(overrides: Partial<Parameters<typeof computeProposalMeta>[0]> = {}) {
  return computeProposalMeta({
    candidate: {},
    touchedFields: new Set(),
    predictedFields: new Set(),
    aiProposedFields: new Set(),
    carriedForwardFields: new Set(),
    aiEvidenceByField: {},
    inlineErrors: {},
    ...overrides,
  });
}

describe("computeProposalMeta", () => {
  it("returns empty map when no provenance signals", () => {
    const meta = makeMeta();
    expect(meta.size).toBe(0);
  });

  it("marks touched fields as coach_edited / resolved", () => {
    const meta = makeMeta({
      candidate: { dn: "3" },
      touchedFields: new Set(["dn"]),
    });
    const m = meta.get("dn")!;
    expect(m.provenance).toBe("coach_edited" satisfies ProvenanceSource);
    expect(m.status).toBe("resolved" satisfies FieldStatus);
    expect(m.value).toBe("3");
  });

  it("marks predicted fields as predicted / resolved", () => {
    const meta = makeMeta({
      candidate: { yardLn: -28 },
      predictedFields: new Set(["yardLn"]),
    });
    const m = meta.get("yardLn")!;
    expect(m.provenance).toBe("predicted");
    expect(m.status).toBe("resolved");
  });

  it("marks carried-forward fields", () => {
    const meta = makeMeta({
      candidate: { posLT: 72 },
      carriedForwardFields: new Set(["posLT"]),
    });
    const m = meta.get("posLT")!;
    expect(m.provenance).toBe("carry_forward");
    expect(m.status).toBe("resolved");
  });

  it("marks ai-proposed with evidence as deterministic_parse", () => {
    const meta = makeMeta({
      candidate: { offPlay: "26 Punch" },
      aiProposedFields: new Set(["offPlay"]),
      aiEvidenceByField: { offPlay: { snippet: "Play 26 Punch" } },
    });
    const m = meta.get("offPlay")!;
    expect(m.provenance).toBe("deterministic_parse");
    expect(m.transcriptEvidence).toBe("Play 26 Punch");
    expect(m.status).toBe("resolved");
  });

  it("marks ai-proposed without evidence as ai_proposed", () => {
    const meta = makeMeta({
      candidate: { dist: "10" },
      aiProposedFields: new Set(["dist"]),
    });
    const m = meta.get("dist")!;
    expect(m.provenance).toBe("ai_proposed");
    expect(m.transcriptEvidence).toBeNull();
  });

  it("touched overrides ai_proposed (priority)", () => {
    const meta = makeMeta({
      candidate: { dn: "2" },
      touchedFields: new Set(["dn"]),
      aiProposedFields: new Set(["dn"]),
      aiEvidenceByField: { dn: { snippet: "first down" } },
    });
    const m = meta.get("dn")!;
    expect(m.provenance).toBe("coach_edited");
  });

  it("sets governance_blocked when inline error mentions lookup", () => {
    const meta = makeMeta({
      candidate: { offForm: "Purple" },
      aiProposedFields: new Set(["offForm"]),
      aiEvidenceByField: { offForm: { snippet: "form Purple" } },
      inlineErrors: { offForm: "Value not found in lookup" },
    });
    const m = meta.get("offForm")!;
    expect(m.status).toBe("governance_blocked");
  });

  it("sets needs_clarification for non-lookup inline errors", () => {
    const meta = makeMeta({
      candidate: { dn: "abc" },
      touchedFields: new Set(["dn"]),
      inlineErrors: { dn: "Must be an integer" },
    });
    const m = meta.get("dn")!;
    expect(m.status).toBe("needs_clarification");
  });

  it("sets unresolved for empty values with provenance", () => {
    const meta = makeMeta({
      candidate: { dist: "" },
      touchedFields: new Set(["dist"]),
    });
    const m = meta.get("dist")!;
    expect(m.status).toBe("unresolved");
  });

  it("skips gameId and playNum", () => {
    const meta = makeMeta({
      candidate: { gameId: "g1", playNum: 5 },
      touchedFields: new Set(["gameId", "playNum"]),
    });
    expect(meta.has("gameId")).toBe(false);
    expect(meta.has("playNum")).toBe(false);
  });

  it("handles lookup_derived provenance", () => {
    const meta = makeMeta({
      candidate: { offStrength: "Strong" },
      lookupDerivedFields: new Set(["offStrength"]),
    });
    const m = meta.get("offStrength")!;
    expect(m.provenance).toBe("lookup_derived");
    expect(m.status).toBe("resolved");
  });
});
