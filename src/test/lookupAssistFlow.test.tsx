/**
 * Slice F2.a — Lookup Assist Integration Smoke Test
 *
 * Locks the deterministic Lookup Assist lifecycle for Pass 1 Play Details:
 *
 *   collectAssistCandidates → grouped Collision rows → RawInputCollisionDialog
 *     → coach selects one option per group (single-select enforced)
 *     → Apply routes selections through applySystemPatch
 *        with { fillOnly:false, source:"deterministic_parse" }
 *     → Skip applies nothing; never commits
 *     → scanner whole-canonical winners are NOT shown by Assist
 *
 * Like F1 this drives the lifecycle through a small harness that mirrors
 * Pass1SectionPanel's wiring branch (avoids IDB + provider seeding).
 */

import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import {
  collectAssistCandidates,
  type AssistSignal,
} from "@/engine/lookupAssist";
import { scanKnownLookups } from "@/engine/lookupScanner";
import {
  RawInputCollisionDialog,
  type Collision,
} from "@/components/RawInputCollisionDialog";

const LOOKUP = new Map<string, readonly string[]>([
  ["offForm", ["Invader", "Vader Tight", "Black"]],
  ["offPlay", ["26 Punch", "26 Punch Fake", "39 Sweep"]],
  ["motion", ["Z Across", "Z Jet"]],
]);

const SIGNAL_LABEL: Record<AssistSignal, string> = {
  numeric: "Number match",
  prefix: "Starts with",
  contains: "Contains",
  stt_edit: "Sounds like",
  synonym: "Phrasing match",
  exact: "Exact",
  overlap: "Related",
};

interface ApplyArgs {
  patch: Record<string, unknown>;
  opts: { fillOnly: boolean; source: string };
}

function AssistHarness({
  text,
  applySystemPatch,
}: {
  text: string;
  applySystemPatch: (patch: Record<string, unknown>, opts: { fillOnly: boolean; source: string }) => void;
}) {
  const lookupAsMutable = new Map(
    Array.from(LOOKUP.entries()).map(([k, v]) => [k, [...v]]),
  );
  const scanResult = scanKnownLookups(text, lookupAsMutable, [
    "offForm",
    "offPlay",
    "motion",
  ]);
  const report = collectAssistCandidates({
    sectionText: text,
    scannerResult: scanResult,
    lookupMap: LOOKUP,
  });

  const rows: Collision[] = [];
  const patchByRow = new Map<string, { field: string; canonical: string }>();
  for (const [field, res] of Object.entries(report.perField)) {
    if (!res || res.kind !== "options") continue;
    for (const opt of res.knownOptions) {
      const id = `assist::${field}::${opt.canonical}`;
      rows.push({
        fieldName: id,
        currentValue: null,
        proposedValue: opt.canonical,
        source: "lookup_assist",
        groupKey: field,
        signalLabel: opt.signals[0] ? SIGNAL_LABEL[opt.signals[0]] : undefined,
      });
      patchByRow.set(id, { field, canonical: opt.canonical });
    }
  }

  const [open, setOpen] = useState(true);
  if (!open || rows.length === 0) return <div data-testid="empty">empty</div>;

  return (
    <RawInputCollisionDialog
      open
      collisions={rows}
      nonCollisionCount={0}
      onCancel={() => setOpen(false)}
      onConfirm={(selectedFields) => {
        const patch: Record<string, unknown> = {};
        const claimed = new Set<string>();
        for (const id of selectedFields) {
          const e = patchByRow.get(id);
          if (!e) continue;
          if (claimed.has(e.field)) continue;
          claimed.add(e.field);
          patch[e.field] = { value: e.canonical, matchType: "exact" };
        }
        if (Object.keys(patch).length > 0) {
          applySystemPatch(patch, { fillOnly: false, source: "deterministic_parse" });
        }
        setOpen(false);
      }}
    />
  );
}

describe("Slice F2.a — Lookup Assist integration", () => {
  it("multi-field input opens grouped dialog with Formation, Play, Motion groups", () => {
    const apply = vi.fn();
    render(<AssistHarness text="Vader formation, Fake 26 Punch, Z acros motion" applySystemPatch={apply} />);
    expect(screen.getByText("Pick known values")).toBeInTheDocument();
    // Each governed group surfaces at least one canonical option.
    expect(screen.getByText("Vader Tight")).toBeInTheDocument();
    expect(screen.getByText("26 Punch Fake")).toBeInTheDocument();
    expect(screen.getByText("Z Across")).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();
  });

  it("Apply selected calls applySystemPatch once with selected canonicals, fillOnly:false, source:'deterministic_parse'", () => {
    const apply = vi.fn();
    render(<AssistHarness text="Vader formation, Fake 26 Punch, Z acros motion" applySystemPatch={apply} />);
    // Select first option in each visible group via row text.
    fireEvent.click(screen.getByText("Vader Tight").closest("label")!);
    fireEvent.click(screen.getByText("26 Punch Fake").closest("label")!);
    fireEvent.click(screen.getByText("Z Across").closest("label")!);
    fireEvent.click(screen.getByRole("button", { name: /Apply selected \(3\)/ }));
    expect(apply).toHaveBeenCalledTimes(1);
    const [patch, opts] = apply.mock.calls[0];
    expect(opts).toEqual({ fillOnly: false, source: "deterministic_parse" });
    expect(patch).toEqual({
      offForm: { value: "Vader Tight", matchType: "exact" },
      offPlay: { value: "26 Punch Fake", matchType: "exact" },
      motion: { value: "Z Across", matchType: "exact" },
    });
  });

  it("Skip applies nothing", () => {
    const apply = vi.fn();
    render(<AssistHarness text="Vader formation, Fake 26 Punch" applySystemPatch={apply} />);
    fireEvent.click(screen.getByRole("button", { name: /^Skip$/ }));
    expect(apply).not.toHaveBeenCalled();
  });

  it("scanner whole-canonical match suppresses Assist for that field", () => {
    const apply = vi.fn();
    // "Invader" is a full canonical — scanner wins, Assist should not show offForm group.
    render(<AssistHarness text="Invader formation, 26 Punch" applySystemPatch={apply} />);
    // No Assist row for offForm canonicals.
    expect(screen.queryByText("Vader Tight")).not.toBeInTheDocument();
    // offPlay also full canonical → no Assist there either.
    expect(screen.queryByText("26 Punch Fake")).not.toBeInTheDocument();
    // Harness shows "empty" when no rows surface.
    expect(screen.getByTestId("empty")).toBeInTheDocument();
  });
});
