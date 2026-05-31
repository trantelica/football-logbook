/**
 * Pass 3 narrow STT normalization: "left tackled" → "left tackle".
 * Strictly scoped to grade narration parser.
 */
import { describe, it, expect } from "vitest";
import { parseGradeNarration } from "@/engine/gradeNarrationParser";

describe("parseGradeNarration — left tackled normalization", () => {
  it("normalizes 'left tackled got a 2' → gradeLT=2 only", () => {
    const r = parseGradeNarration("left tackled got a 2");
    expect(r.patch).toEqual({ gradeLT: 2 });
  });

  it("normalizes within a larger utterance", () => {
    const r = parseGradeNarration("left tackled got a 1 center got a 0");
    expect(r.patch).toEqual({ gradeLT: 1, gradeC: 0 });
  });

  it("is case-insensitive", () => {
    const r = parseGradeNarration("Left Tackled +3");
    expect(r.patch).toEqual({ gradeLT: 3 });
  });

  it("does not affect 'left tackle' (no regression)", () => {
    const r = parseGradeNarration("left tackle got a 2");
    expect(r.patch).toEqual({ gradeLT: 2 });
  });
});
