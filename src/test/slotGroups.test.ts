/**
 * Canonical slot layout — shared by Pass 2 (personnel) and Pass 3 (grades).
 *
 * These tests exist to stop the two passes drifting apart. Before the layout
 * was shared, Pass 3 grouped the eleven slots spatially while Pass 2 rendered
 * them as one flat grid, so the same players appeared in two different
 * arrangements depending on which pass the coach was in.
 */

import { describe, it, expect } from "vitest";
import {
  GRADE_FIELDS,
  GRADE_LABELS,
  PERSONNEL_LABELS,
  PERSONNEL_POSITIONS,
  SLOT_GROUPS,
  gradeFieldFor,
  posFieldFor,
  type SlotKey,
} from "@/engine/personnel";

const allSlots = SLOT_GROUPS.flatMap((g) => g.slots);

describe("SLOT_GROUPS", () => {
  it("covers all eleven slots exactly once", () => {
    expect(allSlots).toHaveLength(11);
    expect(new Set(allSlots).size).toBe(11);
  });

  it("maps onto every personnel field with nothing left over", () => {
    const derived = allSlots.map(posFieldFor).sort();
    expect(derived).toEqual([...PERSONNEL_POSITIONS].sort());
  });

  it("maps onto every grade field with nothing left over", () => {
    const derived = allSlots.map(gradeFieldFor).sort();
    expect(derived).toEqual([...GRADE_FIELDS].sort());
  });

  it("keeps the offensive line in field order, left to right", () => {
    // A coach reads the line spatially; re-sorting this would misrepresent it.
    expect(SLOT_GROUPS[0].slots.slice(0, 5)).toEqual(["LT", "LG", "C", "RG", "RT"]);
  });

  it("keeps the skill row in field order rather than numeric order", () => {
    // Deliberately not 1-2-3-4 — tidier on screen, wrong on the field.
    expect(SLOT_GROUPS[1].slots).toEqual(["X", "3", "2", "4"]);
  });

  it("isolates the signal caller", () => {
    expect(SLOT_GROUPS[2].slots).toEqual(["1"]);
  });
});

describe("slot field helpers", () => {
  it("produces labels that round-trip back to the slot key", () => {
    // The label a coach sees must be the canonical slot identity (UX spec §10),
    // so pos/grade fields for a slot always carry the same visible name.
    for (const slot of allSlots as SlotKey[]) {
      expect(PERSONNEL_LABELS[posFieldFor(slot)]).toBe(slot);
      expect(GRADE_LABELS[gradeFieldFor(slot)]).toBe(slot);
    }
  });
});
