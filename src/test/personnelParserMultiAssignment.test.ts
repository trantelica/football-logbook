import { describe, it, expect } from "vitest";
import { parsePersonnelNarration } from "@/engine/personnelParser";
import type { PositionAliasMap } from "@/engine/positionAliases";

// Aliases per the manual test setup: F → pos3, Z → pos4.
const aliases: PositionAliasMap = {
  pos3: "F",
  pos4: "Z",
};

const FULL_TEXT =
  "We have number one playing left tackle number two playing left guard number 3 Playing Center, #4 playing right guard number five playing right tackle number six playing X number seven playing Y number eight playing one number nine playing two number 10 playing f and #0 playing z";

describe("parsePersonnelNarration — multi-assignment run-on dictation", () => {
  it("Test 1: full dictated phrase extracts all 11 canonical assignments (incl. F→pos3, Z→pos4)", () => {
    const r = parsePersonnelNarration(FULL_TEXT, aliases);
    expect(r.patch).toEqual({
      posLT: 1,
      posLG: 2,
      posC: 3,
      posRG: 4,
      posRT: 5,
      posX: 6,
      posY: 7,
      pos1: 8,
      pos2: 9,
      pos3: 10,
      pos4: 0,
    });
    expect(r.duplicateJerseys).toEqual([]);
    expect(r.sameSlotConflicts).toEqual([]);
    expect(r.offRosterJerseys).toEqual([]);
  });

  it("Test 2: two consecutive 'number N playing <role>' phrases without punctuation extract both", () => {
    const r = parsePersonnelNarration(
      "number one playing left tackle number two playing left guard",
      aliases,
    );
    expect(r.patch).toEqual({ posLT: 1, posLG: 2 });
  });

  it("Test 3: '#4 playing right guard' extracts posRG = 4", () => {
    const r = parsePersonnelNarration("#4 playing right guard", aliases);
    expect(r.patch).toEqual({ posRG: 4 });
  });

  it("Test 4: 'number 3 playing center' extracts posC = 3 (case-insensitive)", () => {
    const r = parsePersonnelNarration("number 3 Playing Center", aliases);
    expect(r.patch).toEqual({ posC: 3 });
  });

  it("Test 5: 'playing one' / 'playing two' resolve to canonical pos1 / pos2", () => {
    const r = parsePersonnelNarration(
      "number eight playing one number nine playing two",
      aliases,
    );
    expect(r.patch).toEqual({ pos1: 8, pos2: 9 });
  });

  it("Test 6: alias-resolved 'playing f' / 'playing z' extract pos3 = 10 and pos4 = 0", () => {
    const r = parsePersonnelNarration(
      "number 10 playing f and #0 playing z",
      aliases,
    );
    expect(r.patch).toEqual({ pos3: 10, pos4: 0 });
  });

  it("Test 7: intra-utterance duplicate jersey is still blocked across run-on dictation", () => {
    // #7 targeted at two different slots in one unpunctuated block.
    const r = parsePersonnelNarration(
      "number seven playing left tackle number seven playing left guard",
      aliases,
    );
    // First wins; second flagged as duplicate (NOT silently re-routed).
    expect(r.patch).toEqual({ posLT: 7 });
    expect(r.duplicateJerseys).toEqual([7]);
    expect(r.report.some((e) => e.status === "duplicate" && e.jersey === 7)).toBe(
      true,
    );
  });

  it("Test 8: off-roster governance still blocks unknown jerseys in run-on dictation", () => {
    const roster = new Set<number>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // no #0
    const r = parsePersonnelNarration(FULL_TEXT, aliases, null, roster);
    // #0 must be blocked, all other 10 still apply.
    expect(r.patch.pos4).toBeUndefined();
    expect(r.offRosterJerseys).toEqual([0]);
    expect(r.patch).toEqual({
      posLT: 1,
      posLG: 2,
      posC: 3,
      posRG: 4,
      posRT: 5,
      posX: 6,
      posY: 7,
      pos1: 8,
      pos2: 9,
      pos3: 10,
    });
  });
});
