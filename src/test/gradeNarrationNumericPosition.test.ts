/**
 * Pass 3 numeric-position phrasing: "<digit/word> position gets a <grade>".
 * Strictly scoped to grade narration parser; no AI, no fuzzy matching.
 */
import { describe, it, expect } from "vitest";
import { parseGradeNarration } from "@/engine/gradeNarrationParser";

describe("parseGradeNarration — numeric position phrases", () => {
  it("'the one position gets a one' → grade1=1", () => {
    expect(parseGradeNarration("the one position gets a one").patch).toEqual({ grade1: 1 });
  });
  it("'the two position gets a one' → grade2=1", () => {
    expect(parseGradeNarration("the two position gets a one").patch).toEqual({ grade2: 1 });
  });
  it("'the three position gets a two' → grade3=2", () => {
    expect(parseGradeNarration("the three position gets a two").patch).toEqual({ grade3: 2 });
  });
  it("'the four position gets a one' → grade4=1", () => {
    expect(parseGradeNarration("the four position gets a one").patch).toEqual({ grade4: 1 });
  });
  it("combined sentence with three numeric positions", () => {
    const r = parseGradeNarration(
      "the one position gets a one and the two position gets a one and the three position gets a two"
    );
    expect(r.patch).toEqual({ grade1: 1, grade2: 1, grade3: 2 });
  });
  it("'four position gets a one' (no leading 'the') → grade4=1", () => {
    expect(parseGradeNarration("four position gets a one").patch).toEqual({ grade4: 1 });
  });
  it("digit form: '1 position gets a 1' → grade1=1", () => {
    expect(parseGradeNarration("1 position gets a 1").patch).toEqual({ grade1: 1 });
  });
  it("'4 gets a 1' → grade4=1 (existing filler-disambiguated form)", () => {
    expect(parseGradeNarration("4 gets a 1").patch).toEqual({ grade4: 1 });
  });
});
