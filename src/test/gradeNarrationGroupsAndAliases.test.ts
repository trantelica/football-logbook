/**
 * Pass 3 grade narration — alias resolution (F/H) and group expansion
 * (O line, "X and H get a two"). Deterministic; no AI.
 */
import { describe, it, expect } from "vitest";
import { parseGradeNarration } from "@/engine/gradeNarrationParser";
import type { PositionAliasMap } from "@/engine/positionAliases";

const ALIASES: PositionAliasMap = { pos2: "H", pos3: "F" };

describe("parseGradeNarration — aliases (F/H) and group expansion", () => {
  it("test phrase 1: F → grade3, two back → grade2, all canonical positions", () => {
    const utterance =
      "Left tackle gets a one left guard gets a two center gets a one right guard gets a one right tackle gets a one Y gets a 2 X gets a one The F gets a two the two back gets a two";
    const r = parseGradeNarration(utterance, ALIASES);
    expect(r.patch).toEqual({
      gradeLT: 1,
      gradeLG: 2,
      gradeC: 1,
      gradeRG: 1,
      gradeRT: 1,
      gradeY: 2,
      gradeX: 1,
      grade3: 2,
      grade2: 2,
    });
  });

  it("test phrase 2: O line + Y each get a one; X + H get a two", () => {
    const utterance =
      "All of the O line and Y positions each get a one And the X in the H Get a two";
    const r = parseGradeNarration(utterance, ALIASES);
    expect(r.patch).toEqual({
      gradeLT: 1,
      gradeLG: 1,
      gradeC: 1,
      gradeRG: 1,
      gradeRT: 1,
      gradeY: 1,
      gradeX: 2,
      grade2: 2,
    });
  });

  it("'O line each gets a one' expands to LT/LG/C/RG/RT", () => {
    const r = parseGradeNarration("O line each gets a one");
    expect(r.patch).toEqual({
      gradeLT: 1, gradeLG: 1, gradeC: 1, gradeRG: 1, gradeRT: 1,
    });
  });

  it("'offensive line each gets a two' expands to LT/LG/C/RG/RT", () => {
    const r = parseGradeNarration("offensive line each gets a two");
    expect(r.patch).toEqual({
      gradeLT: 2, gradeLG: 2, gradeC: 2, gradeRG: 2, gradeRT: 2,
    });
  });

  it("'oline gets a one' (collapsed) expands to LT/LG/C/RG/RT", () => {
    const r = parseGradeNarration("oline gets a one");
    expect(r.patch).toEqual({
      gradeLT: 1, gradeLG: 1, gradeC: 1, gradeRG: 1, gradeRT: 1,
    });
  });

  it("F alias requires aliasMap — without it, F is unrecognized", () => {
    const r = parseGradeNarration("F gets a two");
    expect(r.patch).toEqual({});
  });

  it("F alias resolves to grade3 with aliasMap", () => {
    const r = parseGradeNarration("F gets a two", ALIASES);
    expect(r.patch).toEqual({ grade3: 2 });
  });

  it("H alias resolves to grade2 with aliasMap", () => {
    const r = parseGradeNarration("H gets a one", ALIASES);
    expect(r.patch).toEqual({ grade2: 1 });
  });

  it("group expansion does not fire for a single position", () => {
    const r = parseGradeNarration("Y received a one");
    expect(r.patch).toEqual({ gradeY: 1 });
  });

  it("conflict policy preserved for group expansion (same field different values)", () => {
    // Y is graded 1 in the group, then graded 3 individually.
    const r = parseGradeNarration("O line and Y each get a one Y gets a three");
    // gradeY should be excluded (conflict). O line still applies.
    expect(r.patch.gradeY).toBeUndefined();
    expect(r.patch).toMatchObject({
      gradeLT: 1, gradeLG: 1, gradeC: 1, gradeRG: 1, gradeRT: 1,
    });
  });

  it("'X in the H' STT normalization is scoped to short tokens", () => {
    // Normal prose 'apples in the basket' must NOT be rewritten.
    const r = parseGradeNarration("apples in the basket", ALIASES);
    expect(r.patch).toEqual({});
  });
});
