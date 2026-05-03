/**
 * Slice F1 — AI Correction Lifecycle Integration Smoke Test (Pass 1 Play Details)
 *
 * Locks together Slices A–E by exercising the real units that compose the
 * coach-facing correction flow:
 *
 *   - Slice A/B/D1: fetchAiProposal — section scoping, response filtering,
 *     suspectFields gating, corrections shape validation
 *   - Slice E:      RawInputCollisionDialog — display-only "ai_correction"
 *                   metadata, "Review suggested updates" title, chips,
 *                   skip/apply button copy
 *
 * Only the supabase edge invocation is mocked. The dialog is real. A small
 * in-test harness mimics Pass1SectionPanel's correction-routing logic
 * (build Collision rows, route accepted rows through applySystemPatch).
 *
 * NOTE: this is intentionally NOT a full Pass1SectionPanel render — that
 * would require seeding IDB plus Game/Season/Roster/Lookup/Transaction
 * providers, making this brittle. The correction lifecycle (the actual
 * Slices A–E contract) is what we lock here.
 */

import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { fetchAiProposal } from "@/engine/aiEnrichClient";
import {
  RawInputCollisionDialog,
  type Collision,
} from "@/components/RawInputCollisionDialog";
import type { ParserSuspicionReport } from "@/engine/parserSuspicion";
import type { CandidateData } from "@/engine/types";

// Mock the supabase edge function invocation only.
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

// Season-scoped lookup map used by the AI client.
const LOOKUP = new Map<string, string[]>([
  ["offForm", ["Shiny", "Black", "Red"]],
  ["offPlay", ["39 Reverse Pass", "26 Punch"]],
  ["motion", ["Z Jet"]],
]);

// Suspicious parser values matching the fixture transcript.
const FIXTURE_TEXT = "The play is 39 Reverse Pass from Shiny formation.";
const PARSER_PATCH: Record<string, unknown> = {
  offForm: "Pass From Shiny",
  offPlay: "Reverse",
};

function fixtureSuspicion(): ParserSuspicionReport {
  return {
    perField: {
      offForm: {
        fieldName: "offForm",
        observedValue: "Pass From Shiny",
        codes: ["connector_absorbed"] as never,
        evidence: {},
      },
      offPlay: {
        fieldName: "offPlay",
        observedValue: "Reverse",
        codes: ["scanner_conflict"] as never,
        scannerCanonical: "39 Reverse Pass",
        evidence: {},
      },
    },
    signals: [],
  };
}

function candidateWith(parser: Record<string, unknown>): CandidateData {
  return { gameId: "g1", ...parser } as CandidateData;
}

/**
 * In-test harness mimicking Pass1SectionPanel's correction-routing branch.
 * It builds display-tagged Collision rows from corrections and exposes an
 * `applySystemPatch` spy so accept/skip assertions can be made without
 * spinning up the full TransactionProvider.
 */
function CorrectionFlowHarness({
  corrections,
  candidate,
  applySystemPatch,
  ownedSet,
}: {
  corrections: Record<string, { value: string; matchType: string }>;
  candidate: Record<string, unknown>;
  applySystemPatch: (
    patch: Record<string, unknown>,
    opts: { fillOnly: boolean; source: string },
  ) => void;
  ownedSet: Set<string>;
}) {
  // Always-derived fields the panel hard-blocks.
  const DERIVED = new Set([
    "offStrength",
    "personnel",
    "playType",
    "playDir",
    "motionDir",
    "eff",
  ]);

  const rows: Collision[] = [];
  const correctionPatch: Record<string, unknown> = {};
  for (const [k, c] of Object.entries(corrections)) {
    if (!ownedSet.has(k)) continue;
    if (DERIVED.has(k)) continue;
    correctionPatch[k] = { value: c.value, matchType: c.matchType };
    rows.push({
      fieldName: k,
      currentValue: candidate[k] ?? null,
      proposedValue: c.value,
      source: "ai_correction",
      note: "AI suggests this fits the transcript better.",
    });
  }

  const [open, setOpen] = useState(true);
  if (!open || rows.length === 0) return null;

  return (
    <RawInputCollisionDialog
      open
      collisions={rows}
      nonCollisionCount={0}
      onCancel={() => setOpen(false)}
      onConfirm={(selectedFields) => {
        const accepted: Record<string, unknown> = {};
        for (const k of Object.keys(correctionPatch)) {
          if (selectedFields.has(k)) accepted[k] = correctionPatch[k];
        }
        if (Object.keys(accepted).length > 0) {
          applySystemPatch(accepted, { fillOnly: false, source: "ai_proposed" });
        }
        setOpen(false);
      }}
    />
  );
}

// playDetails section ownedFields (simplified; mirrors what panel passes).
const PLAY_DETAILS_OWNED = new Set([
  "offForm",
  "offPlay",
  "motion",
  "offStrength",
  "personnel",
  "playType",
  "playDir",
  "motionDir",
]);

beforeEach(() => {
  invokeMock.mockReset();
});

describe("Slice F1 — AI correction lifecycle (Pass 1 Play Details)", () => {
  async function fetchFixtureCorrections(opts?: {
    extraCorrections?: Record<string, unknown>;
    extraProposal?: Record<string, unknown>;
  }) {
    invokeMock.mockResolvedValue({
      data: {
        proposal: opts?.extraProposal ?? {},
        corrections: {
          offForm: { value: "Shiny", matchType: "exact" },
          offPlay: { value: "39 Reverse Pass", matchType: "exact" },
          ...(opts?.extraCorrections ?? {}),
        },
      },
      error: null,
    });
    return fetchAiProposal(candidateWith(PARSER_PATCH), 1, {
      observationText: FIXTURE_TEXT,
      activeSection: "playDetails",
      lookupValues: LOOKUP,
      parserPatch: PARSER_PATCH,
      parserSuspicion: fixtureSuspicion(),
      deterministicParseFields: new Set(["offForm", "offPlay"]),
    });
  }

  it("1+3+4. fixture: dialog shows 'Review suggested updates' with two AI rows + chips", async () => {
    const result = await fetchFixtureCorrections();
    expect(result.corrections?.offForm?.value).toBe("Shiny");
    expect(result.corrections?.offPlay?.value).toBe("39 Reverse Pass");

    const applySystemPatch = vi.fn();
    render(
      <CorrectionFlowHarness
        corrections={result.corrections as never}
        candidate={PARSER_PATCH}
        applySystemPatch={applySystemPatch}
        ownedSet={PLAY_DETAILS_OWNED}
      />,
    );

    expect(screen.getByText("Review suggested updates")).toBeInTheDocument();
    expect(
      screen.getByText(/Accepting updates the draft only\. You'll still review and commit\./i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("AI suggestion")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Skip suggestions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /suggestion\(s\)/i })).toBeInTheDocument();
    expect(applySystemPatch).not.toHaveBeenCalled();
  });

  it("5. Skip leaves proposal unchanged and never commits", async () => {
    const result = await fetchFixtureCorrections();
    const applySystemPatch = vi.fn();
    render(
      <CorrectionFlowHarness
        corrections={result.corrections as never}
        candidate={PARSER_PATCH}
        applySystemPatch={applySystemPatch}
        ownedSet={PLAY_DETAILS_OWNED}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Skip suggestions/i }));
    expect(applySystemPatch).not.toHaveBeenCalled();
    // No commit code path is exercised because applySystemPatch alone never commits.
  });

  it("6. Accept applies corrections to proposal only via applySystemPatch (fillOnly:false, ai_proposed); never commits", async () => {
    const result = await fetchFixtureCorrections();
    const applySystemPatch = vi.fn();
    render(
      <CorrectionFlowHarness
        corrections={result.corrections as never}
        candidate={PARSER_PATCH}
        applySystemPatch={applySystemPatch}
        ownedSet={PLAY_DETAILS_OWNED}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /suggestion\(s\)/i }));
    expect(applySystemPatch).toHaveBeenCalledTimes(1);
    const [patch, opts] = applySystemPatch.mock.calls[0];
    expect(patch).toEqual({
      offForm: { value: "Shiny", matchType: "exact" },
      offPlay: { value: "39 Reverse Pass", matchType: "exact" },
    });
    expect(opts.fillOnly).toBe(false);
    expect(opts.source).toBe("ai_proposed");
  });

  it("7. candidate_new correction preserves canonical {value,matchType} shape so lookup governance still interrupts", async () => {
    invokeMock.mockResolvedValue({
      data: {
        proposal: {},
        corrections: {
          offForm: { value: "Purple", matchType: "candidate_new" },
        },
      },
      error: null,
    });
    const result = await fetchAiProposal(candidateWith(PARSER_PATCH), 1, {
      observationText: FIXTURE_TEXT,
      activeSection: "playDetails",
      lookupValues: LOOKUP,
      parserPatch: PARSER_PATCH,
      parserSuspicion: fixtureSuspicion(),
    });
    expect(result.corrections?.offForm).toEqual(
      expect.objectContaining({ value: "Purple", matchType: "candidate_new" }),
    );

    const applySystemPatch = vi.fn();
    render(
      <CorrectionFlowHarness
        corrections={result.corrections as never}
        candidate={PARSER_PATCH}
        applySystemPatch={applySystemPatch}
        ownedSet={PLAY_DETAILS_OWNED}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /suggestion\(s\)/i }));
    // Shape preserved so applySystemPatch's governance branch fires for candidate_new.
    expect(applySystemPatch.mock.calls[0][0]).toEqual({
      offForm: { value: "Purple", matchType: "candidate_new" },
    });
  });

  it("8. out-of-section AI fields (e.g. gainLoss) are dropped by fetchAiProposal and never reach proposal/corrections", async () => {
    invokeMock.mockResolvedValue({
      data: {
        proposal: { gainLoss: 12, dn: 3, offForm: "Shiny" /* in-section but not via corrections */ },
        corrections: {
          offForm: { value: "Shiny", matchType: "exact" },
          gainLoss: { value: "12", matchType: "exact" }, // not allowlisted
          dn: { value: "3", matchType: "exact" },        // not allowlisted
        },
      },
      error: null,
    });
    const result = await fetchAiProposal(candidateWith(PARSER_PATCH), 1, {
      observationText: FIXTURE_TEXT,
      activeSection: "playDetails",
      lookupValues: LOOKUP,
      parserPatch: PARSER_PATCH,
      parserSuspicion: fixtureSuspicion(),
    });
    // Out-of-section keys defensively dropped from proposal.
    expect(result.proposal.gainLoss).toBeUndefined();
    expect(result.proposal.dn).toBeUndefined();
    // Non-allowlisted correction fields dropped.
    expect((result.corrections as Record<string, unknown> | undefined)?.gainLoss).toBeUndefined();
    expect((result.corrections as Record<string, unknown> | undefined)?.dn).toBeUndefined();
    // Allowlisted correction survives.
    expect(result.corrections?.offForm?.value).toBe("Shiny");
  });
});
