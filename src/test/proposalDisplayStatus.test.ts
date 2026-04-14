import { describe, it, expect } from "vitest";
import { isFieldRelevant, computeDisplayStatus } from "../engine/proposalDisplayStatus";
import type { FieldDefinition } from "../engine/schema";
import type { ProposalMetaMap } from "../engine/proposalMeta";

function makeDef(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    name: "offForm",
    label: "Off. Formation",
    dataType: "string",
    source: "LOOKUP",
    defaultPolicy: "null",
    defaultPassEntry: 1,
    requiredAtCommit: false,
    ...overrides,
  };
}

function emptyOpts() {
  return {
    activePass: 1,
    touchedFields: new Set<string>(),
    deterministicParseFields: new Set<string>(),
    aiProposedFields: new Set<string>(),
    predictedFields: new Set<string>(),
    carriedForwardFields: new Set<string>(),
    lookupDerivedFields: new Set<string>(),
    proposalMeta: new Map() as ProposalMetaMap,
    candidateValue: null as unknown,
  };
}

describe("isFieldRelevant", () => {
  it("skips system fields", () => {
    expect(isFieldRelevant("gameId", makeDef({ name: "gameId", defaultPassEntry: 0 }), emptyOpts())).toBe(false);
    expect(isFieldRelevant("playNum", makeDef({ name: "playNum", defaultPassEntry: 0 }), emptyOpts())).toBe(false);
  });

  it("skips fields outside active pass", () => {
    expect(isFieldRelevant("offForm", makeDef({ defaultPassEntry: 2 }), { ...emptyOpts(), activePass: 1 })).toBe(false);
  });

  it("relevant when has value", () => {
    expect(isFieldRelevant("offForm", makeDef(), { ...emptyOpts(), candidateValue: "Trips" })).toBe(true);
  });

  it("relevant when touched", () => {
    const opts = { ...emptyOpts(), touchedFields: new Set(["offForm"]) };
    expect(isFieldRelevant("offForm", makeDef(), opts)).toBe(true);
  });

  it("relevant when AI-proposed", () => {
    const opts = { ...emptyOpts(), aiProposedFields: new Set(["offForm"]) };
    expect(isFieldRelevant("offForm", makeDef(), opts)).toBe(true);
  });

  it("relevant when governance-blocked", () => {
    const meta: ProposalMetaMap = new Map([
      ["offForm", { fieldName: "offForm", value: "Purple", provenance: "deterministic_parse", status: "governance_blocked", transcriptEvidence: null, notes: null }],
    ]);
    const opts = { ...emptyOpts(), proposalMeta: meta };
    expect(isFieldRelevant("offForm", makeDef(), opts)).toBe(true);
  });

  it("relevant when required at commit", () => {
    expect(isFieldRelevant("qtr", makeDef({ name: "qtr", requiredAtCommit: true, defaultPassEntry: 0 }), emptyOpts())).toBe(true);
  });

  it("irrelevant when empty, no provenance, not required", () => {
    expect(isFieldRelevant("offForm", makeDef(), emptyOpts())).toBe(false);
  });
});

describe("computeDisplayStatus", () => {
  it("returns blocked when governance_blocked", () => {
    const meta: ProposalMetaMap = new Map([
      ["offForm", { fieldName: "offForm", value: "Purple", provenance: "deterministic_parse", status: "governance_blocked", transcriptEvidence: null, notes: null }],
    ]);
    expect(computeDisplayStatus("offForm", { candidateValue: "Purple", proposalMeta: meta, aiProposedFields: new Set() })).toBe("blocked");
  });

  it("returns ai_proposed when AI-proposed with value", () => {
    expect(computeDisplayStatus("dist", { candidateValue: "10", proposalMeta: new Map(), aiProposedFields: new Set(["dist"]) })).toBe("ai_proposed");
  });

  it("returns unresolved when AI-proposed but empty", () => {
    expect(computeDisplayStatus("dist", { candidateValue: "", proposalMeta: new Map(), aiProposedFields: new Set(["dist"]) })).toBe("unresolved");
  });

  it("returns resolved when has value", () => {
    expect(computeDisplayStatus("dn", { candidateValue: "2", proposalMeta: new Map(), aiProposedFields: new Set() })).toBe("resolved");
  });

  it("returns unresolved when empty", () => {
    expect(computeDisplayStatus("dn", { candidateValue: null, proposalMeta: new Map(), aiProposedFields: new Set() })).toBe("unresolved");
  });
});
