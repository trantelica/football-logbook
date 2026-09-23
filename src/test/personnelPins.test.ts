import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizePins,
  loadPersonnelPins,
  savePersonnelPins,
  applyPinnedPersonnel,
  pinsAfterEdit,
} from "@/engine/personnelPins";

describe("personnelPins", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes only canonical positions with integer jerseys", () => {
    const pins = normalizePins({ posC: "55", posX: 7, bogus: 1, posLT: -2, posY: 1.5 });
    expect(pins).toEqual({ posC: 55, posX: 7 });
  });

  it("round-trips pins per game", () => {
    savePersonnelPins("g1", { posC: 55 });
    expect(loadPersonnelPins("g1")).toEqual({ posC: 55 });
    expect(loadPersonnelPins("g2")).toEqual({});
  });

  it("clears storage when all pins removed", () => {
    savePersonnelPins("g1", { posC: 55 });
    savePersonnelPins("g1", {});
    expect(loadPersonnelPins("g1")).toEqual({});
  });

  it("seeds only empty pinned positions and never overwrites", () => {
    const { candidate, pinnedFields } = applyPinnedPersonnel(
      { posC: 99, posLT: null, posX: "" },
      { posC: 55, posLT: 70, posX: 4 },
    );
    expect(candidate.posC).toBe(99);
    expect(candidate.posLT).toBe(70);
    expect(candidate.posX).toBe(4);
    expect([...pinnedFields].sort()).toEqual(["posLT", "posX"]);
  });

  it("seeds nothing when there are no pins", () => {
    const { candidate, pinnedFields } = applyPinnedPersonnel({ posC: null }, {});
    expect(candidate.posC).toBeNull();
    expect(pinnedFields.size).toBe(0);
  });

  it("drops the pin when the pinned position is replaced", () => {
    const pins = { posC: 55, posX: 4 };
    expect(pinsAfterEdit(pins, "posC", 61)).toEqual({ posX: 4 });
    expect(pinsAfterEdit(pins, "posC", "")).toEqual({ posX: 4 });
  });

  it("keeps the pin when the same jersey is re-entered", () => {
    const pins = { posC: 55 };
    expect(pinsAfterEdit(pins, "posC", "55")).toBe(pins);
  });

  it("ignores edits to unpinned fields", () => {
    const pins = { posC: 55 };
    expect(pinsAfterEdit(pins, "posY", 9)).toBe(pins);
  });
});
