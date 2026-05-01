/**
 * Tests for Pass 3 grade narration parser.
 *
 * Covers canonical short-form, natural speech phrasing, spoken numbers,
 * conflict detection, and the exact acceptance-test utterance.
 */

import { describe, it, expect } from "vitest";
import { parseGradeNarration, normalizeGradePatchKeys } from "@/engine/gradeNarrationParser";

describe("parseGradeNarration", () => {
  // ── Basic short-form (backward compat) ───────────────────────────────
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

  it("parses numeric position keys 1..4 with filler", () => {
    const r = parseGradeNarration("1 got a 2");
    expect(r.patch).toEqual({ grade1: 2 });
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

  it("returns empty patch for empty input", () => {
    expect(parseGradeNarration("").patch).toEqual({});
    expect(parseGradeNarration("   ").patch).toEqual({});
  });

  it("only emits canonical grade* keys (no aliases)", () => {
    const r = parseGradeNarration("LT 1, LG 1, C 1, RG 1, RT 1, X 1, Y 1");
    const allowed = new Set([
      "gradeLT", "gradeLG", "gradeC", "gradeRG", "gradeRT",
      "gradeX", "gradeY", "grade1", "grade2", "grade3", "grade4",
    ]);
    for (const k of Object.keys(r.patch)) {
      expect(allowed.has(k)).toBe(true);
    }
  });

  // ── Speech / natural language patterns ───────────────────────────────

  it("handles 'got a' phrasing", () => {
    const r = parseGradeNarration("left tackle got a 1");
    expect(r.patch).toEqual({ gradeLT: 1 });
  });

  it("handles 'received a' phrasing", () => {
    const r = parseGradeNarration("Y received a one");
    expect(r.patch).toEqual({ gradeY: 1 });
  });

  it("handles spoken number words as grades", () => {
    const r = parseGradeNarration("center minus three");
    expect(r.patch).toEqual({ gradeC: -3 });
  });

  it("handles 'our' filler before position", () => {
    const r = parseGradeNarration("our left guard got a two");
    expect(r.patch).toEqual({ gradeLG: 2 });
  });

  it("handles 'the four' as numeric position", () => {
    const r = parseGradeNarration("the four got a two");
    expect(r.patch).toEqual({ grade4: 2 });
  });

  it("handles 'the one' as numeric position", () => {
    const r = parseGradeNarration("the one got a three");
    expect(r.patch).toEqual({ grade1: 3 });
  });

  it("handles 'centre' spelling", () => {
    const r = parseGradeNarration("centre -2");
    expect(r.patch).toEqual({ gradeC: -2 });
  });

  it("handles negative three as spoken words", () => {
    const r = parseGradeNarration("RT negative three");
    expect(r.patch).toEqual({ gradeRT: -3 });
  });

  // ── Conflict detection ───────────────────────────────────────────────

  it("detects conflict when same position gets different values", () => {
    const r = parseGradeNarration("LT got a 1 and left tackle got a 3");
    expect(r.patch).toEqual({});
    expect(r.report.filter((x) => x.status === "conflict")).toHaveLength(2);
  });

  it("allows same value repeated (no conflict)", () => {
    const r = parseGradeNarration("LT got a 2 and left tackle got a 2");
    expect(r.patch).toEqual({ gradeLT: 2 });
  });

  it("normalizes proposal patch aliases to canonical grade keys", () => {
    expect(normalizeGradePatchKeys({
      ltGrade: 1,
      lgGrade: 1,
      cGrade: 0,
      rgGrade: -1,
      rtGrade: 2,
      yGrade: 3,
      grade4: -1,
    })).toEqual({
      gradeLT: 1,
      gradeLG: 1,
      gradeC: 0,
      gradeRG: -1,
      gradeRT: 2,
      gradeY: 3,
      grade4: -1,
    });
  });

  // ── Acceptance test utterance ────────────────────────────────────────

  it("parses the full acceptance-test utterance", () => {
    const r = parseGradeNarration(
      "OK our left tackle got a one our left guard got a 2 center -3 right guard a two right tackle a 1 Y received a one and the four got a two",
    );
    expect(r.patch).toEqual({
      gradeLT: 1,
      gradeLG: 2,
      gradeC: -3,
      gradeRG: 2,
      gradeRT: 1,
      gradeY: 1,
      grade4: 2,
    });
    expect(r.report.filter((x) => x.status === "matched")).toHaveLength(7);
    expect(r.report.filter((x) => x.status !== "matched")).toHaveLength(0);
  });

  it("parses the retest-failed utterance with coach filler phrasing", () => {
    const r = parseGradeNarration(
      "OK here are grades left tackle gets a one left guard gets a one center gets a zero right guard gets a negative one right tackle gets a two the Y looks like a three And the number four back is a minus one grade",
    );
    expect(r.patch).toEqual({
      gradeLT: 1,
      gradeLG: 1,
      gradeC: 0,
      gradeRG: -1,
      gradeRT: 2,
      gradeY: 3,
      grade4: -1,
    });
    expect(r.report.filter((x) => x.status === "matched")).toHaveLength(7);
    expect(r.report.filter((x) => x.status !== "matched")).toHaveLength(0);
  });

  // ── Collapsed / joined-token normalization ────────────────────────────

  it("parses collapsed 'Y1' as gradeY = 1", () => {
    expect(parseGradeNarration("Y1").patch).toEqual({ gradeY: 1 });
  });

  it("parses collapsed 'X2' as gradeX = 2", () => {
    expect(parseGradeNarration("X2").patch).toEqual({ gradeX: 2 });
  });

  it("parses collapsed 'LT1' as gradeLT = 1", () => {
    expect(parseGradeNarration("LT1").patch).toEqual({ gradeLT: 1 });
  });

  it("parses collapsed 'LG2' as gradeLG = 2", () => {
    expect(parseGradeNarration("LG2").patch).toEqual({ gradeLG: 2 });
  });

  it("parses collapsed 'C0' as gradeC = 0", () => {
    expect(parseGradeNarration("C0").patch).toEqual({ gradeC: 0 });
  });

  it("parses collapsed 'RG-1' as gradeRG = -1", () => {
    expect(parseGradeNarration("RG-1").patch).toEqual({ gradeRG: -1 });
  });

  it("parses collapsed 'RT3' as gradeRT = 3", () => {
    expect(parseGradeNarration("RT3").patch).toEqual({ gradeRT: 3 });
  });

  it("does not split 'four-1' (not a known short position)", () => {
    // "four" is not in the collapsed position set; should not produce grade4
    const r = parseGradeNarration("four-1");
    expect(r.patch).toEqual({});
  });

  it("parses realistic utterance with collapsed Y1", () => {
    const r = parseGradeNarration(
      "left tackle one left guard one center zero right guard negative one right tackle two Y1 and number four minus one",
    );
    expect(r.patch).toEqual({
      gradeLT: 1,
      gradeLG: 1,
      gradeC: 0,
      gradeRG: -1,
      gradeRT: 2,
      gradeY: 1,
      grade4: -1,
    });
    expect(r.report.filter((x) => x.status === "matched")).toHaveLength(7);
  });
});
