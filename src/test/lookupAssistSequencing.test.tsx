/**
 * Slice F2.a sequencing — Lookup Assist runs BEFORE Unknown Lookup Value
 *
 * Locks the ordering rule for Pass 1 Play Details governed fields
 * (offForm/offPlay/motion):
 *
 *   parser produced raw partial value, not a known canonical
 *     AND collectAssistCandidates returned options for that field
 *       → defer raw-value write
 *       → defer governance check
 *       → show Lookup Assist dialog FIRST
 *
 *   coach selects an existing Assist canonical
 *       → apply canonical, do NOT open Unknown Lookup Value for that field
 *
 *   coach skips/cancels (or did not pick a group)
 *       → fall back: write raw parsed value, then open Unknown Lookup Value
 *
 *   scanner whole-canonical winner exists
 *       → no Assist, no governance fired against a partial value
 *
 * The harness mirrors Pass1SectionPanel.runUpdateProposal's branch for
 * Assist-deferred governed fields — it does not seed IDB / providers.
 */

import React, { useMemo, useState } from "react";
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

const LOOKUP = new Map<string, string[]>([
  ["offForm", ["Invader", "Vader Tight", "Black"]],
  ["offPlay", ["26 Punch", "26 Punch Fake", "26 Power", "39 Sweep"]],
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

const ASSIST_FIELDS = ["offForm", "offPlay", "motion"] as const;
type AssistField = (typeof ASSIST_FIELDS)[number];

interface PatchCall {
  patch: Record<string, unknown>;
  source: string;
}

interface GovernanceCall {
  candidate: Record<string, unknown>;
}

function isKnownCanonical(field: string, value: unknown): boolean {
  if (typeof value !== "string") return false;
  const norm = value.toLowerCase().replace(/\s+/g, " ").trim();
  const known = LOOKUP.get(field) ?? [];
  return known.some((e) => e.toLowerCase().replace(/\s+/g, " ").trim() === norm);
}

/**
 * Mirrors the Pass1SectionPanel sequencing branch. Inputs simulate what the
 * deterministic parser produced; the harness:
 *  - runs scanner + Assist
 *  - decides deferred fields
 *  - emits fillablePatch (excluding deferred)
 *  - opens dialog with Assist rows
 *  - on confirm/cancel applies fallback raw + invokes governance
 */
function SequencingHarness({
  text,
  parserPatch,
  applySystemPatch,
  checkGovernance,
}: {
  text: string;
  parserPatch: Record<string, unknown>;
  applySystemPatch: (patch: Record<string, unknown>, opts: { fillOnly: boolean; source: string }) => void;
  checkGovernance: (projected: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(true);

  const { rows, patchByRow, deferred, deferredRaw, governanceProjected } = useMemo(() => {
    const lookupMutable = new Map(
      Array.from(LOOKUP.entries()).map(([k, v]) => [k, [...v]]),
    );
    const scanResult = scanKnownLookups(text, lookupMutable, [
      ...ASSIST_FIELDS,
    ]);
    const report = collectAssistCandidates({
      sectionText: text,
      parserPatch,
      scannerResult: scanResult,
      lookupMap: LOOKUP,
    });

    const deferred = new Set<AssistField>();
    const deferredRaw: Record<string, unknown> = {};
    for (const field of ASSIST_FIELDS) {
      const v = parserPatch[field];
      if (v === undefined || v === null || v === "") continue;
      if (isKnownCanonical(field, v)) continue;
      const res = report.perField[field];
      if (res && res.kind === "options" && res.knownOptions.length > 0) {
        deferred.add(field);
        deferredRaw[field] = v;
      }
    }

    const fillable: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parserPatch)) {
      if (deferred.has(k as AssistField)) continue;
      fillable[k] = v;
    }
    if (Object.keys(fillable).length > 0) {
      applySystemPatch(fillable, { fillOnly: true, source: "deterministic_parse" });
    }
    // Scanner-fillable
    const scannerFillable: Record<string, unknown> = {};
    for (const f of ASSIST_FIELDS) {
      const hit = scanResult.perField[f];
      if (!hit) continue;
      if (parserPatch[f] !== undefined) continue;
      scannerFillable[f] = hit.canonical;
    }
    if (Object.keys(scannerFillable).length > 0) {
      applySystemPatch(scannerFillable, { fillOnly: true, source: "deterministic_parse" });
    }

    const rows: Collision[] = [];
    const patchByRow = new Map<string, { field: AssistField; canonical: string }>();
    for (const [field, res] of Object.entries(report.perField)) {
      if (!res || res.kind !== "options") continue;
      for (const opt of res.knownOptions) {
        const rowId = `assist::${field}::${opt.canonical}`;
        rows.push({
          fieldName: rowId,
          currentValue: null,
          proposedValue: opt.canonical,
          source: "lookup_assist",
          groupKey: field,
          signalLabel: opt.signals[0] ? SIGNAL_LABEL[opt.signals[0]] : undefined,
        });
        patchByRow.set(rowId, { field: field as AssistField, canonical: opt.canonical });
      }
    }

    // Initial governance projection: includes everything we wrote, EXCLUDES
    // deferred fields. This is the immediate post-Update governance check.
    const projected = { ...fillable, ...scannerFillable };
    return { rows, patchByRow, deferred, deferredRaw, governanceProjected: projected };
  }, [text, parserPatch, applySystemPatch]);

  // Initial governance check (deferred excluded).
  React.useEffect(() => {
    checkGovernance(governanceProjected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyAssistFallback = (resolvedFields: Set<AssistField>) => {
    const fallback: Record<string, unknown> = {};
    for (const field of deferred) {
      if (resolvedFields.has(field)) continue;
      const raw = deferredRaw[field];
      if (raw === undefined || raw === null || raw === "") continue;
      fallback[field] = raw;
    }
    if (Object.keys(fallback).length > 0) {
      applySystemPatch(fallback, { fillOnly: true, source: "deterministic_parse" });
      checkGovernance({ ...governanceProjected, ...fallback });
    }
  };

  if (!open || rows.length === 0) return <div data-testid="empty">empty</div>;

  return (
    <RawInputCollisionDialog
      open
      collisions={rows}
      nonCollisionCount={0}
      onCancel={() => {
        setOpen(false);
        applyAssistFallback(new Set());
      }}
      onConfirm={(selectedFields) => {
        const acceptedAssist: Record<string, unknown> = {};
        const claimed = new Set<AssistField>();
        for (const id of selectedFields) {
          const e = patchByRow.get(id);
          if (!e) continue;
          if (claimed.has(e.field)) continue;
          claimed.add(e.field);
          acceptedAssist[e.field] = e.canonical;
        }
        if (Object.keys(acceptedAssist).length > 0) {
          applySystemPatch(acceptedAssist, { fillOnly: false, source: "deterministic_parse" });
        }
        applyAssistFallback(claimed);
        setOpen(false);
      }}
    />
  );
}

describe("Slice F2.a — Lookup Assist sequencing vs. lookup governance", () => {
  it("'We run 26 from black formation.' → Assist opens, governance NOT fired with offPlay='26'", () => {
    const apply = vi.fn();
    const gov = vi.fn();
    render(
      <SequencingHarness
        text="We run 26 from black formation."
        parserPatch={{ offPlay: "26", offForm: "Black" }}
        applySystemPatch={apply}
        checkGovernance={gov}
      />,
    );
    // Assist visible for Play (26 Punch / 26 Power / 26 Punch Fake)
    expect(screen.getByText("26 Punch")).toBeInTheDocument();
    // No applySystemPatch carried offPlay = "26" before resolution
    for (const call of apply.mock.calls) {
      const patch = call[0] as Record<string, unknown>;
      expect(patch.offPlay).not.toBe("26");
    }
    // Governance was checked at most once with NO offPlay key (raw value
    // suppressed because Assist deferred it).
    for (const call of gov.mock.calls) {
      const projected = call[0] as Record<string, unknown>;
      expect(projected.offPlay).toBeUndefined();
    }
  });

  it("Selecting an existing Assist option applies canonical and does NOT escalate governance for that field", () => {
    const apply = vi.fn();
    const gov = vi.fn();
    render(
      <SequencingHarness
        text="We run 26 from black formation."
        parserPatch={{ offPlay: "26" }}
        applySystemPatch={apply}
        checkGovernance={gov}
      />,
    );
    fireEvent.click(screen.getByText("26 Punch").closest("label")!);
    fireEvent.click(screen.getByRole("button", { name: /Apply selected \(1\)/ }));

    // The canonical landed via applySystemPatch as a bare string.
    const canonicalCall = apply.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).offPlay === "26 Punch",
    );
    expect(canonicalCall).toBeDefined();
    // No fallback patch wrote offPlay = "26".
    for (const call of apply.mock.calls) {
      expect((call[0] as Record<string, unknown>).offPlay).not.toBe("26");
    }
    // No governance call ever saw offPlay = "26".
    for (const call of gov.mock.calls) {
      expect((call[0] as Record<string, unknown>).offPlay).not.toBe("26");
    }
  });

  it("Skipping/cancelling Assist falls back to raw value and triggers governance for it", () => {
    const apply = vi.fn();
    const gov = vi.fn();
    render(
      <SequencingHarness
        text="We run 26."
        parserPatch={{ offPlay: "26" }}
        applySystemPatch={apply}
        checkGovernance={gov}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Skip$/ }));
    // Fallback patch wrote offPlay = "26"
    const fallback = apply.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).offPlay === "26",
    );
    expect(fallback).toBeDefined();
    // Governance was invoked again with offPlay = "26" → existing Unknown
    // Lookup Value flow takes over from here.
    const govWithRaw = gov.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).offPlay === "26",
    );
    expect(govWithRaw).toBeDefined();
  });

  it("Multi-field partial selection: selected resolves canonically, unselected falls back + governance", () => {
    const apply = vi.fn();
    const gov = vi.fn();
    render(
      <SequencingHarness
        text="Vader formation, run 26."
        parserPatch={{ offForm: "Vader", offPlay: "26" }}
        applySystemPatch={apply}
        checkGovernance={gov}
      />,
    );
    // Pick the Formation Assist option only.
    fireEvent.click(screen.getByText("Vader Tight").closest("label")!);
    fireEvent.click(screen.getByRole("button", { name: /Apply selected \(1\)/ }));

    // Canonical applied for offForm
    const canonicalForm = apply.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).offForm === "Vader Tight",
    );
    expect(canonicalForm).toBeDefined();
    // Fallback raw applied for offPlay
    const fallbackPlay = apply.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).offPlay === "26",
    );
    expect(fallbackPlay).toBeDefined();
    // No applySystemPatch ever wrote offForm = "Vader" raw
    for (const call of apply.mock.calls) {
      expect((call[0] as Record<string, unknown>).offForm).not.toBe("Vader");
    }
    // Governance saw offPlay="26" but never offForm="Vader"
    const govPlay = gov.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).offPlay === "26",
    );
    expect(govPlay).toBeDefined();
    for (const call of gov.mock.calls) {
      expect((call[0] as Record<string, unknown>).offForm).not.toBe("Vader");
    }
  });

  it("Whole-canonical scanner match still bypasses Assist and does not trigger governance", () => {
    const apply = vi.fn();
    const gov = vi.fn();
    // Parser yields nothing for these; scanner picks up canonical "Invader" and "26 Punch".
    render(
      <SequencingHarness
        text="Invader formation, 26 Punch."
        parserPatch={{}}
        applySystemPatch={apply}
        checkGovernance={gov}
      />,
    );
    // No Assist dialog rows surfaced.
    expect(screen.getByTestId("empty")).toBeInTheDocument();
    // Scanner fillable wrote canonicals.
    const wroteForm = apply.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).offForm === "Invader",
    );
    const wrotePlay = apply.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).offPlay === "26 Punch",
    );
    expect(wroteForm).toBeDefined();
    expect(wrotePlay).toBeDefined();
    // Governance never saw raw partial values.
    for (const call of gov.mock.calls) {
      const p = call[0] as Record<string, unknown>;
      expect(p.offPlay).not.toBe("26");
      expect(p.offForm).not.toBe("Vader");
    }
  });
});
