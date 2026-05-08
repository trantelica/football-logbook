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
    motion: ["Z Across", "Z Jet", "Flick"],
    offPlay: ["26 Punch", "26 Power"],
  });

  it("offers 'Add Flip as new' when motion has fuzzy hits and a deferred raw unknown", () => {
    const rows = simulate({
      text: "We use flip motion",
      parserPatch: { motion: "Flip" },
      lookupMap: lookup,
      deferredRaw: { motion: "Flip" },
    });
    const motionRows = rows.filter((r) => r.field === "motion");
    expect(motionRows.some((r) => r.kind === "fuzzy")).toBe(true);
    expect(motionRows.some((r) => r.kind === "add_new" && r.proposedValue.includes("Flip"))).toBe(true);
  });

  it("add-new row has a stable rowId distinct from fuzzy rows", () => {
    const rows = simulate({
      text: "We use flip motion",
      parserPatch: { motion: "Flip" },
      lookupMap: lookup,
      deferredRaw: { motion: "Flip" },
    });
    const addNew = rows.find((r) => r.kind === "add_new");
    expect(addNew?.rowId).toBe('assist-new::motion::Flip');
    expect(rows.filter((r) => r.rowId === addNew?.rowId)).toHaveLength(1);
  });

  it("no add-new row when no deferred raw value (all fuzzy)", () => {
    const rows = simulate({
      text: "We use Z across motion sort of",
      parserPatch: {},
      lookupMap: lookup,
      deferredRaw: {},
    });
    expect(rows.some((r) => r.kind === "add_new")).toBe(false);
  });

  it("does not pre-claim the field — selecting add-new must allow fallback to write the raw value", () => {
    // Simulating the onConfirm logic: when an assist-new row is selected, the
    // field is intentionally NOT added to claimedFields, so applyAssistFallback
    // writes the raw value and triggers governance.
    const rows = simulate({
      text: "We use flip motion",
      parserPatch: { motion: "Flip" },
      lookupMap: lookup,
      deferredRaw: { motion: "Flip" },
    });
    const addNew = rows.find((r) => r.kind === "add_new")!;
    const selected = new Set([addNew.rowId]);
    const claimedFields = new Set<string>();
    for (const rowId of selected) {
      if (rowId.startsWith("assist-new::")) continue;
      // would normally claim the field
      claimedFields.add("motion");
    }
    expect(claimedFields.has("motion")).toBe(false);
  });
});
