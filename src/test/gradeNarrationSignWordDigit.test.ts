/**
 * Pass 3 narrow fix: sign-word + digit grade values ("minus 1", "negative 2", "plus 1").
 */
import { describe, it, expect } from "vitest";
import { parseGradeNarration } from "@/engine/gradeNarrationParser";

describe("parseGradeNarration — sign-word + digit", () => {
  it("'left tackle got a minus 1' → gradeLT=-1", () => {
    expect(parseGradeNarration("left tackle got a minus 1").patch).toEqual({ gradeLT: -1 });
  });
  it("'left tackle got a negative 2' → gradeLT=-2", () => {
    expect(parseGradeNarration("left tackle got a negative 2").patch).toEqual({ gradeLT: -2 });
  });
  it("'left tackle got a plus 1' → gradeLT=1", () => {
    expect(parseGradeNarration("left tackle got a plus 1").patch).toEqual({ gradeLT: 1 });
  });
  it("out-of-range sign-word + digit is flagged", () => {
    const r = parseGradeNarration("LT minus 5");
    expect(r.patch).toEqual({});
    expect(r.report.some(x => x.status === "out_of_range")).toBe(true);
  });
  it("preserves existing 'minus one' word form", () => {
    expect(parseGradeNarration("center minus three").patch).toEqual({ gradeC: -3 });
  });
  it("preserves existing '-1' signed-digit form", () => {
    expect(parseGradeNarration("C -1").patch).toEqual({ gradeC: -1 });
  });
});
