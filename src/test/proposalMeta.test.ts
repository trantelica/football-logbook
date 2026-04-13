import { describe, it, expect } from "vitest";
import { computeProposalMeta, type ProvenanceSource, type FieldStatus, type ValidationReasonCode } from "../engine/proposalMeta";

function makeMeta(overrides: Partial<Parameters<typeof computeProposalMeta>[0]> = {}) {
  return computeProposalMeta({
    candidate: {},
    touchedFields: new Set(),
    predictedFields: new Set(),
    deterministicParseFields: new Set(),
    aiProposedFields: new Set(),
    lookupDerivedFields: new Set(),
    carriedForwardFields: new Set(),
    parseEvidenceByField: {},
    aiEvidenceByField: {},
    validationReasons: {},
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

  it("marks lookup-derived fields as lookup_derived / resolved", () => {
    const meta = makeMeta({
      candidate: { offStrength: "Rt" },
      lookupDerivedFields: new Set(["offStrength"]),
    });
    const m = meta.get("offStrength")!;
    expect(m.provenance).toBe("lookup_derived");
    expect(m.status).toBe("resolved");
  });

  it("coach edit overrides lookup_derived (priority)", () => {
    const meta = makeMeta({
      candidate: { offStrength: "Lt" },
      touchedFields: new Set(["offStrength"]),
      lookupDerivedFields: new Set(["offStrength"]),
    });
    const m = meta.get("offStrength")!;
    expect(m.provenance).toBe("coach_edited");
  });

  it("deterministic_parse overrides lookup_derived (priority)", () => {
    const meta = makeMeta({
      candidate: { offStrength: "Rt" },
      deterministicParseFields: new Set(["offStrength"]),
      lookupDerivedFields: new Set(["offStrength"]),
    });
    const m = meta.get("offStrength")!;
    expect(m.provenance).toBe("deterministic_parse");
  });

  it("marks deterministicParseFields as deterministic_parse with evidence", () => {
    const meta = makeMeta({
      candidate: { offPlay: "26 Punch" },
      deterministicParseFields: new Set(["offPlay"]),
      parseEvidenceByField: { offPlay: { snippet: "Play 26 Punch" } },
    });
    const m = meta.get("offPlay")!;
    expect(m.provenance).toBe("deterministic_parse");
    expect(m.transcriptEvidence).toBe("Play 26 Punch");
    expect(m.status).toBe("resolved");
  });

  it("marks aiProposedFields as ai_proposed (distinct from parse)", () => {
    const meta = makeMeta({
      candidate: { dist: "10" },
      aiProposedFields: new Set(["dist"]),
    });
    const m = meta.get("dist")!;
    expect(m.provenance).toBe("ai_proposed");
    expect(m.transcriptEvidence).toBeNull();
  });

  it("touched overrides deterministic_parse (priority)", () => {
    const meta = makeMeta({
      candidate: { dn: "2" },
      touchedFields: new Set(["dn"]),
      deterministicParseFields: new Set(["dn"]),
      parseEvidenceByField: { dn: { snippet: "first down" } },
    });
    const m = meta.get("dn")!;
    expect(m.provenance).toBe("coach_edited");
  });

  it("deterministic_parse overrides ai_proposed (priority)", () => {
    const meta = makeMeta({
      candidate: { dn: "1" },
      deterministicParseFields: new Set(["dn"]),
      aiProposedFields: new Set(["dn"]),
    });
    const m = meta.get("dn")!;
    expect(m.provenance).toBe("deterministic_parse");
  });

  it("sets governance_blocked when validationReasons has lookup_not_found", () => {
    const meta = makeMeta({
      candidate: { offForm: "Purple" },
      deterministicParseFields: new Set(["offForm"]),
      parseEvidenceByField: { offForm: { snippet: "form Purple" } },
      validationReasons: { offForm: "lookup_not_found" as ValidationReasonCode },
    });
    const m = meta.get("offForm")!;
    expect(m.status).toBe("governance_blocked");
  });

  it("sets governance_blocked when validationReasons has roster_not_found", () => {
    const meta = makeMeta({
      candidate: { rusher: 99 },
      touchedFields: new Set(["rusher"]),
      validationReasons: { rusher: "roster_not_found" as ValidationReasonCode },
    });
    const m = meta.get("rusher")!;
    expect(m.status).toBe("governance_blocked");
  });

  it("sets needs_clarification for type_error validation reason", () => {
    const meta = makeMeta({
      candidate: { dn: "abc" },
      touchedFields: new Set(["dn"]),
      validationReasons: { dn: "type_error" as ValidationReasonCode },
    });
    const m = meta.get("dn")!;
    expect(m.status).toBe("needs_clarification");
  });

  it("sets needs_clarification for enum_error validation reason", () => {
    const meta = makeMeta({
      candidate: { result: "NotReal" },
      touchedFields: new Set(["result"]),
      validationReasons: { result: "enum_error" as ValidationReasonCode },
    });
    const m = meta.get("result")!;
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

  it("uses parseEvidence for deterministicParse and aiEvidence for ai_proposed", () => {
    const meta = makeMeta({
      candidate: { dn: "1", dist: "10" },
      deterministicParseFields: new Set(["dn"]),
      aiProposedFields: new Set(["dist"]),
      parseEvidenceByField: { dn: { snippet: "first down" } },
      aiEvidenceByField: { dist: { snippet: "10 yards" } },
    });
    expect(meta.get("dn")!.transcriptEvidence).toBe("first down");
    expect(meta.get("dist")!.transcriptEvidence).toBe("10 yards");
  });
});
