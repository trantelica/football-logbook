/**
 * Step 1 (governance/Assist coexistence): Lookup Assist must NOT open a
 * "Pick Known Values" group for any governed field that is already pending
 * (or about to enter) lookup governance for the current proposal cycle.
 *
 * This test mirrors the suppression logic added to
 * Pass1SectionPanel.runUpdateProposal: combine the projected candidate +
 * patches, build the governance queue from that snapshot, then drop Assist
 * groups whose `field` appears in `governancePendingFields`.
 */

import { describe, it, expect } from "vitest";
import { collectAssistCandidates } from "@/engine/lookupAssist";
import { buildLookupGovernanceQueue } from "@/engine/lookupGovernanceQueue";

const lookupOf = (entries: Record<string, string[]>) =>
  new Map<string, string[]>(Object.entries(entries));

interface SimInput {
  text: string;
  candidate: Record<string, unknown>;
  parserPatch: Record<string, unknown>;
  lookupMap: Map<string, string[]>;
  /** External pending governance (e.g., a previous unresolved interrupt). */
  externalPending?: string | null;
}

interface SimOutput {
  assistGroups: string[]; // groupKey (field) per group emitted to dialog
  governanceFields: string[]; // fields suppressed because of governance
}

/** Mirrors the Pass1SectionPanel Step 1 suppression branch. */
function simulate(input: SimInput): SimOutput {
  const projected: Record<string, unknown> = {
    ...input.candidate,
    ...input.parserPatch,
  };
  const queue = buildLookupGovernanceQueue(projected, input.lookupMap);
  const governancePendingFields = new Set<string>(queue.map((it) => it.fieldName));
  if (input.externalPending) governancePendingFields.add(input.externalPending);

  const report = collectAssistCandidates({
    sectionText: input.text,
    parserPatch: input.parserPatch,
    lookupMap: input.lookupMap,
  });

  const assistGroups: string[] = [];
  for (const [field, res] of Object.entries(report.perField)) {
    if (!res || res.kind !== "options") continue;
    if (governancePendingFields.has(field)) continue;
    assistGroups.push(field);
  }
  return { assistGroups, governanceFields: [...governancePendingFields] };
}

describe("Lookup Assist × governance — Step 1 suppression", () => {
  const lookup = lookupOf({
    offForm: ["Invader", "Vader Tight", "Black"],
    offPlay: ["26 Punch", "26 Power", "26 Punch Fake", "39 Sweep"],
    motion: ["Z Across", "Z Jet"],
  });

  it("offPlay pending governance → no offPlay Assist group", () => {
    // Parser produced an unknown governed value "26 Blast" for offPlay.
    // Projection includes it; buildLookupGovernanceQueue enqueues it.
    const out = simulate({
      text: "We run 26 blast.",
      candidate: {},
      parserPatch: { offPlay: "26 Blast" },
      lookupMap: lookup,
    });
    expect(out.governanceFields).toContain("offPlay");
    expect(out.assistGroups).not.toContain("offPlay");
  });

  it("offPlay pending governance, offForm assist eligible → offForm group still shows", () => {
    const out = simulate({
      text: "Vader formation, run 26 blast.",
      candidate: {},
      // Parser only landed offPlay (unknown). offForm has only fragment "Vader".
      parserPatch: { offPlay: "26 Blast" },
      lookupMap: lookup,
    });
    expect(out.governanceFields).toContain("offPlay");
    expect(out.assistGroups).not.toContain("offPlay");
    expect(out.assistGroups).toContain("offForm");
  });

  it("After lookup append (canonical now in lookupMap), no stale Assist for that field", () => {
    // Simulate the post-append state: "26 Blast" is now in lookupMap.
    const post = lookupOf({
      ...Object.fromEntries(lookup),
      offPlay: [...(lookup.get("offPlay") ?? []), "26 Blast"],
    });
    const out = simulate({
      text: "We run 26 blast.",
      candidate: { offPlay: "26 Blast" },
      parserPatch: {},
      lookupMap: post,
    });
    // Governance no longer enqueues offPlay (canonical is known).
    expect(out.governanceFields).not.toContain("offPlay");
    // Assist must not open a stale Pick Known Values group for offPlay,
    // because the field is already filled with a known canonical.
    expect(out.assistGroups).not.toContain("offPlay");
  });

  it("Existing externally-pending governance (e.g., open Add New Value modal) suppresses Assist for that field", () => {
    const out = simulate({
      text: "We run 26.",
      candidate: {},
      parserPatch: { offPlay: "26" },
      lookupMap: lookup,
      externalPending: "offPlay",
    });
    expect(out.governanceFields).toContain("offPlay");
    expect(out.assistGroups).not.toContain("offPlay");
  });

  it("No governance pending and Assist eligible → Assist group still appears", () => {
    const out = simulate({
      text: "We run 26.",
      candidate: {},
      // "26" is not in lookupMap, but parserPatch carries the literal "26"
      // which IS treated as a governed candidate by buildLookupGovernanceQueue
      // — so this becomes a governance scenario. To exercise the
      // "no governance, Assist visible" path, leave parserPatch empty so
      // governance has nothing to enqueue, and let Assist surface options
      // from the section text alone.
      parserPatch: {},
      lookupMap: lookup,
    });
    expect(out.governanceFields).toEqual([]);
    expect(out.assistGroups).toContain("offPlay");
  });
});
