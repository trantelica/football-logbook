/**
 * Tests for Pass 3 grade narration parser.
 *
 * Verifies canonical-key output, range constraint, multi-clause parsing,
 * and unrecognized handling. No commit semantics are tested here — those
 * remain governed by the existing transaction/validation pipeline.
 */

import { describe, it, expect } from "vitest";
import { parseGradeNarration } from "@/engine/gradeNarrationParser";

describe("parseGradeNarration", () => {
  it("parses single short-form clause", () => {
    const r = parseGradeNarration("LT 2");
    expect(r.patch).toEqual({ gradeLT: 2 });
    expect(r.report[0].status).toBe("matched");
  });

  it("parses signed value with leading +", () => {
    const r = parseGradeNarration("RG +3");
    expect(r.patch).toEqual({ gradeRG: 3 });
  });

  it("parses negative value", () => {
    const r = parseGradeNarration("C -1");
    expect(r.patch).toEqual({ gradeC: -1 });
  });

  it("parses long-form position name", () => {
    const r = parseGradeNarration("left tackle 2");
    expect(r.patch).toEqual({ gradeLT: 2 });
  });

  it("splits on commas and parses multiple clauses", () => {
    const r = parseGradeNarration("LT 2, C -1, RG 3");
    expect(r.patch).toEqual({ gradeLT: 2, gradeC: -1, gradeRG: 3 });
    expect(r.report.filter((x) => x.status === "matched")).toHaveLength(3);
  });

  it("splits on ' and '", () => {
    const r = parseGradeNarration("X 0 and Y 1");
    expect(r.patch).toEqual({ gradeX: 0, gradeY: 1 });
  });

  it("parses numeric position keys 1..4", () => {
    const r = parseGradeNarration("1 2, 2 -2, 3 0, 4 3");
    expect(r.patch).toEqual({ grade1: 2, grade2: -2, grade3: 0, grade4: 3 });
  });

  it("flags out-of-range value (>3)", () => {
    const r = parseGradeNarration("LT 4");
    expect(r.patch).toEqual({});
    expect(r.report[0].status).toBe("out_of_range");
  });

  it("flags out-of-range value (<-3)", () => {
    const r = parseGradeNarration("RT -5");
    expect(r.patch).toEqual({});
    expect(r.report[0].status).toBe("out_of_range");
  });

  it("flags unrecognized clauses", () => {
    const r = parseGradeNarration("foo bar");
    expect(r.patch).toEqual({});
    expect(r.report[0].status).toBe("unrecognized");
  });

  it("returns empty patch for empty input", () => {
    expect(parseGradeNarration("").patch).toEqual({});
    expect(parseGradeNarration("   ").patch).toEqual({});
  });

  it("only emits canonical grade* keys (no aliases)", () => {
    const r = parseGradeNarration("LT 1, LG 1, C 1, RG 1, RT 1, X 1, Y 1, 1 1, 2 1, 3 1, 4 1");
    const allowed = new Set([
      "gradeLT", "gradeLG", "gradeC", "gradeRG", "gradeRT",
      "gradeX", "gradeY", "grade1", "grade2", "grade3", "grade4",
    ]);
    for (const k of Object.keys(r.patch)) {
      expect(allowed.has(k)).toBe(true);
    }
    expect(Object.keys(r.patch)).toHaveLength(11);
  });

  it("partial application: matched and skipped clauses coexist", () => {
    const r = parseGradeNarration("LT 2, foo bar, RG 9");
    expect(r.patch).toEqual({ gradeLT: 2 });
    const statuses = r.report.map((x) => x.status);
    expect(statuses).toContain("matched");
    expect(statuses).toContain("unrecognized");
    expect(statuses).toContain("out_of_range");
  });
});
