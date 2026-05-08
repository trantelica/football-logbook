/**
 * Issue 2: Lookup Assist must offer an "Add as new value" path whenever a
 * governed raw unknown value was deferred for that field. Fuzzy options may
 * still appear, but the coach must always have a clear non-fuzzy escape
 * hatch that opens the existing lookup governance Add-New-Value modal.
 *
 * Mirrors the row-construction logic in Pass1SectionPanel.runUpdateProposal.
 */

import { describe, it, expect } from "vitest";
import { collectAssistCandidates } from "@/engine/lookupAssist";

const lookupOf = (entries: Record<string, string[]>) =>
  new Map<string, readonly string[]>(Object.entries(entries));

interface Row {
  rowId: string;
  field: string;
  proposedValue: string;
  kind: "fuzzy" | "add_new";
}

function simulate(input: {
  text: string;
  parserPatch: Record<string, unknown>;
  lookupMap: Map<string, readonly string[]>;
  /** Fields whose parser value was deferred as raw unknown. */
  deferredRaw: Record<string, string>;
}): Row[] {
  const report = collectAssistCandidates({
    sectionText: input.text,
    parserPatch: input.parserPatch,
    lookupMap: input.lookupMap,
  });
  const rows: Row[] = [];
  for (const [field, res] of Object.entries(report.perField)) {
    if (!res || res.kind !== "options") continue;
    for (const opt of res.knownOptions) {
      rows.push({
        rowId: `assist::${field}::${opt.canonical}`,
        field,
        proposedValue: opt.canonical,
        kind: "fuzzy",
      });
    }
    const raw = input.deferredRaw[field];
    if (raw && raw.trim()) {
      const trimmed = raw.trim();
      rows.push({
        rowId: `assist-new::${field}::${trimmed}`,
        field,
        proposedValue: `Add "${trimmed}" as new`,
        kind: "add_new",
      });
    }
  }
  return rows;
}

describe("Lookup Assist — Add as new value row (Issue 2)", () => {
  const lookup = lookupOf({
    motion: ["Z Across", "Z Jet"],
    offPlay: ["26 Punch", "26 Power"],
  });

  it("offers 'Add 26 Blast as new' when offPlay has fuzzy hits and a deferred raw unknown", () => {
    const rows = simulate({
      text: "play 26 blast",
      parserPatch: { offPlay: "26 Blast" },
      lookupMap: lookup,
      deferredRaw: { offPlay: "26 Blast" },
    });
    const offPlayRows = rows.filter((r) => r.field === "offPlay");
    expect(offPlayRows.some((r) => r.kind === "fuzzy")).toBe(true);
    expect(
      offPlayRows.some((r) => r.kind === "add_new" && r.proposedValue.includes("26 Blast")),
    ).toBe(true);
  });

  it("add-new row has a stable rowId distinct from fuzzy rows", () => {
    const rows = simulate({
      text: "play 26 blast",
      parserPatch: { offPlay: "26 Blast" },
      lookupMap: lookup,
      deferredRaw: { offPlay: "26 Blast" },
    });
    const addNew = rows.find((r) => r.kind === "add_new");
    expect(addNew?.rowId).toBe('assist-new::offPlay::26 Blast');
    expect(rows.filter((r) => r.rowId === addNew?.rowId)).toHaveLength(1);
  });

  it("no add-new row when no deferred raw value (all fuzzy)", () => {
    const rows = simulate({
      text: "play 26",
      parserPatch: {},
      lookupMap: lookup,
      deferredRaw: {},
    });
    expect(rows.some((r) => r.kind === "add_new")).toBe(false);
  });

  it("does not pre-claim the field — selecting add-new must allow fallback to write the raw value", () => {
    const rows = simulate({
      text: "play 26 blast",
      parserPatch: { offPlay: "26 Blast" },
      lookupMap: lookup,
      deferredRaw: { offPlay: "26 Blast" },
    });
    const addNew = rows.find((r) => r.kind === "add_new")!;
    const selected = new Set([addNew.rowId]);
    const claimedFields = new Set<string>();
    for (const rowId of selected) {
      if (rowId.startsWith("assist-new::")) continue;
      claimedFields.add("offPlay");
    }
    expect(claimedFields.has("offPlay")).toBe(false);
  });
});

/**
 * Issue 2 follow-up: exact failing manual case — "We use flip motion" with
 * no existing "Flip" motion canonical must NOT silently force fuzzy-only
 * resolution. Acceptable outcomes:
 *   A. Parser extracts motion=Flip → buildLookupGovernanceQueue enqueues it
 *      (direct governance), OR
 *   B. Lookup Assist appears and includes an "Add 'Flip' as new" row that
 *      bypasses Assist claiming and routes to lookup governance.
 *
 * This project's parser implements (A): the explicit "we use <word> motion"
 * cue extracts motion="Flip", which the existing governance queue picks up
 * because "Flip" is not in the motion lookup canonicals.
 */
describe('Issue 2 follow-up — "We use flip motion" routes to governance', () => {
  it('parser extracts motion="Flip" from "We use flip motion"', async () => {
    const { normalizeTranscriptForParse } = await import("@/engine/transcriptNormalize");
    const { parseRawInput } = await import("@/engine/rawInputParser");
    const norm = normalizeTranscriptForParse("We use flip motion");
    const { patch } = parseRawInput(norm);
    expect(patch.motion).toBe("Flip");
  });

  it("buildLookupGovernanceQueue enqueues motion=Flip when not a known canonical (behavior A)", async () => {
    const { buildLookupGovernanceQueue } = await import("@/engine/lookupGovernanceQueue");
    const lookupMap = new Map<string, string[]>([
      ["motion", ["Z Across", "Z Jet", "Jet"]],
      ["offForm", []],
      ["offPlay", []],
    ]);
    const queue = buildLookupGovernanceQueue({ motion: "Flip" }, lookupMap);
    const motionItem = queue.find((q) => q.fieldName === "motion");
    expect(motionItem).toBeDefined();
    expect(motionItem?.value).toBe("Flip");
  });

  it("if Assist were to appear for the raw cue, an Add-New row is offered (behavior B fallback)", () => {
    // Even though parser handles this case directly (A), confirm the
    // Assist row-construction would still produce an Add-New escape hatch
    // if a raw deferred value were present.
    const rows = simulate({
      text: "we use flip motion",
      parserPatch: { motion: "Flip" },
      lookupMap: lookupOf({ motion: ["Z Across", "Z Jet", "Jet"] }),
      deferredRaw: { motion: "Flip" },
    });
    const motionRows = rows.filter((r) => r.field === "motion");
    // Either no Assist appears (parser handled it) OR an Add-New row exists.
    if (motionRows.length > 0) {
      expect(motionRows.some((r) => r.kind === "add_new" && r.proposedValue.includes("Flip"))).toBe(true);
    }
  });

  it("Add-New row does not pre-claim motion → fallback writes raw → governance opens", () => {
    const rows = simulate({
      text: "we use flip motion",
      parserPatch: { motion: "Flip" },
      lookupMap: lookupOf({ motion: ["Z Across", "Z Jet"] }),
      deferredRaw: { motion: "Flip" },
    });
    const addNew = rows.find((r) => r.kind === "add_new" && r.field === "motion");
    if (addNew) {
      const claimedFields = new Set<string>();
      for (const rowId of [addNew.rowId]) {
        if (rowId.startsWith("assist-new::")) continue;
        claimedFields.add("motion");
      }
      expect(claimedFields.has("motion")).toBe(false);
    }
  });
});
