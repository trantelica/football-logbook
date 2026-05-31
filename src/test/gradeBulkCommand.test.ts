/**
 * Pass 3 — Deterministic bulk grade command parser tests.
 */
import { describe, it, expect } from "vitest";
import {
  parseGradeBulkCommand,
  computeBulkFillPatch,
} from "@/engine/gradeBulkCommand";
import { GRADE_FIELDS } from "@/engine/personnel";

describe("parseGradeBulkCommand", () => {
  it("matches 'set all empty blocking grades to 1' with no exception", () => {
    const r = parseGradeBulkCommand("set all empty blocking grades to 1");
    expect(r).not.toBeNull();
    expect(r!.status).toBe("matched");
    if (r!.status === "matched") {
      expect(r!.value).toBe(1);
      expect(r!.exceptions.size).toBe(0);
    }
  });

  it("matches the longer 'all remaining empty …' phrasing with no exception", () => {
    const r = parseGradeBulkCommand(
      "all of the remaining empty blocking grades should be set to a 1",
    );
    expect(r).not.toBeNull();
    expect(r!.status).toBe("matched");
    if (r!.status === "matched") {
      expect(r!.value).toBe(1);
      expect(r!.exceptions.size).toBe(0);
    }
  });

  it("matches with canonical exception 'except Y'", () => {
    const r = parseGradeBulkCommand("set all empty blocking grades to 1 except Y");
    expect(r!.status).toBe("matched");
    if (r!.status === "matched") {
      expect(r!.exceptions.has("gradeY")).toBe(true);
      expect(r!.exceptions.size).toBe(1);
    }
  });

  it("matches 'except F' when season alias map maps F → pos3", () => {
    const aliasMap = { pos3: "F" };
    const r = parseGradeBulkCommand(
      "all remaining empty blocking grades should be set to a 1 except F",
      aliasMap,
    );
    expect(r!.status).toBe("matched");
    if (r!.status === "matched") {
      expect(r!.exceptions.has("grade3")).toBe(true);
    }
  });

  it("does NOT resolve F when no season alias map provides it", () => {
    const r = parseGradeBulkCommand(
      "all remaining empty blocking grades should be set to a 1 except F",
    );
    expect(r!.status).toBe("unresolved_exception");
  });

  it("returns unresolved_exception for 'except quarterback'", () => {
    const r = parseGradeBulkCommand(
      "set all empty blocking grades to 1 except for the quarterback in the F",
    );
    expect(r!.status).toBe("unresolved_exception");
  });

  it("returns out_of_range for 'set all empty grades to 5'", () => {
    const r = parseGradeBulkCommand("set all empty grades to 5");
    expect(r!.status).toBe("out_of_range");
  });

  it("returns null for ordinary per-clause utterance 'LT 2 RG -1'", () => {
    expect(parseGradeBulkCommand("LT 2 RG -1")).toBeNull();
  });

  it("returns null for plain 'left tackle got a 1'", () => {
    expect(parseGradeBulkCommand("left tackle got a 1")).toBeNull();
  });

  it("supports spoken-word value 'set all empty blocking grades to one'", () => {
    const r = parseGradeBulkCommand("set all empty blocking grades to one");
    expect(r!.status).toBe("matched");
    if (r!.status === "matched") expect(r!.value).toBe(1);
  });

  it("supports negative spoken value 'set all empty grades to minus 1'", () => {
    const r = parseGradeBulkCommand("set all empty grades to minus 1");
    expect(r!.status).toBe("matched");
    if (r!.status === "matched") expect(r!.value).toBe(-1);
  });
});

describe("computeBulkFillPatch", () => {
  const empty = () => Object.fromEntries(GRADE_FIELDS.map((f) => [f, null]));

  it("fills all empty grade fields when none committed and none in proposal", () => {
    const committed = empty();
    const candidate = empty();
    const { patch, targets } = computeBulkFillPatch(1, new Set(), committed, candidate);
    expect(targets.length).toBe(GRADE_FIELDS.length);
    for (const f of GRADE_FIELDS) expect(patch[f]).toBe(1);
  });

  it("excludes exception fields", () => {
    const committed = empty();
    const candidate = empty();
    const { patch, targets } = computeBulkFillPatch(
      1,
      new Set(["grade3"]),
      committed,
      candidate,
    );
    expect(targets).not.toContain("grade3");
    expect(patch.grade3).toBeUndefined();
    expect(targets.length).toBe(GRADE_FIELDS.length - 1);
  });

  it("does not overwrite committed non-null grades", () => {
    const committed = { ...empty(), gradeLT: 2 };
    const candidate = { ...empty(), gradeLT: 2 };
    const { patch, targets } = computeBulkFillPatch(1, new Set(), committed, candidate);
    expect(targets).not.toContain("gradeLT");
    expect(patch.gradeLT).toBeUndefined();
  });

  it("does not overwrite already-proposed non-null grades", () => {
    const committed = empty();
    const candidate = { ...empty(), gradeRG: -1 };
    const { patch, targets } = computeBulkFillPatch(1, new Set(), committed, candidate);
    expect(targets).not.toContain("gradeRG");
    expect(patch.gradeRG).toBeUndefined();
  });

  it("returns empty patch when no empty grade fields remain", () => {
    const committed = Object.fromEntries(GRADE_FIELDS.map((f) => [f, 0]));
    const candidate = Object.fromEntries(GRADE_FIELDS.map((f) => [f, 0]));
    const { patch, targets } = computeBulkFillPatch(1, new Set(), committed, candidate);
    expect(targets.length).toBe(0);
    expect(Object.keys(patch).length).toBe(0);
  });
});
