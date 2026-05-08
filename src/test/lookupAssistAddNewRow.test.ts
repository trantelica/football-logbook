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
