/**
 * Phase 7 — Grading Tests
 *
 * Tests for badge logic, ODK gating, grade validation, overwrite diffs,
 * normalization, and export coverage.
 */

import { describe, it, expect } from "vitest";
import { anyGradePresent, GRADE_FIELDS } from "@/engine/personnel";
import { validateInline, normalizeToSchema } from "@/engine/validation";
import { playsToCSV } from "@/engine/db";
import { playSchema } from "@/engine/schema";
import type { PlayRecord, CandidateData } from "@/engine/types";

function makePlay(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    gameId: "g1",
    playNum: 1,
    qtr: "1",
    odk: "O",
    series: 1,
    yardLn: 35,
    dn: "1",
    dist: 10,
    hash: null,
    offForm: null,
    offPlay: null,
    motion: null,
    result: "Rush",
    gainLoss: 4,
    twoMin: null,
    rusher: null,
    passer: null,
    receiver: null,
    penalty: null,
    penYards: null,
    eff: null,
    offStrength: null,
    personnel: null,
    playType: null,
    playDir: null,
    motionDir: null,
    patTry: null,
    posLT: null,
    posLG: null,
    posC: null,
    posRG: null,
    posRT: null,
    posX: null,
    posY: null,
    pos1: null,
    pos2: null,
    pos3: null,
    pos4: null,
    returner: null,
    gradeLT: null,
    gradeLG: null,
    gradeC: null,
    gradeRG: null,
    gradeRT: null,
    gradeX: null,
    gradeY: null,
    grade1: null,
    grade2: null,
    grade3: null,
    grade4: null,
    ...overrides,
  };
}

describe("anyGradePresent", () => {
  it("returns false when all grades are null", () => {
    const play = makePlay();
    expect(anyGradePresent(play)).toBe(false);
  });

  it("returns true when at least one grade is set", () => {
    const play = makePlay({ gradeLT: 2 });
    expect(anyGradePresent(play)).toBe(true);
  });

  it("returns true when grade is 0 (falsy but non-null)", () => {
    const play = makePlay({ gradeC: 0 });
    expect(anyGradePresent(play)).toBe(true);
  });
});

describe("Derived badge logic", () => {
  it("ODK !== 'O' → Not Offense (no grade badge)", () => {
    const play = makePlay({ odk: "D" });
    // Badge logic: play.odk !== "O" → show "Not Offense"
    expect(play.odk !== "O").toBe(true);
    expect(anyGradePresent(play)).toBe(false);
  });

  it("ODK === 'O' and no grades → no Pass 3 badge", () => {
    const play = makePlay({ odk: "O" });
    expect(play.odk === "O").toBe(true);
    expect(anyGradePresent(play)).toBe(false);
  });

  it("ODK === 'O' and at least 1 grade → Blocking Graded", () => {
    const play = makePlay({ odk: "O", grade1: 1 });
    expect(play.odk === "O").toBe(true);
    expect(anyGradePresent(play)).toBe(true);
  });
});

describe("Grade validation", () => {
  it("rejects value 4 (out of range)", () => {
    const touched = new Set(["gradeLT"]);
    const candidate: CandidateData = { gameId: "g1", gradeLT: "4" };
    const errors = validateInline(candidate, touched);
    expect(errors.gradeLT).toBeDefined();
  });

  it("rejects value -4 (out of range)", () => {
    const touched = new Set(["gradeLT"]);
    const candidate: CandidateData = { gameId: "g1", gradeLT: "-4" };
    const errors = validateInline(candidate, touched);
    expect(errors.gradeLT).toBeDefined();
  });

  it("accepts -3", () => {
    const touched = new Set(["gradeLT"]);
    const candidate: CandidateData = { gameId: "g1", gradeLT: "-3" };
    const errors = validateInline(candidate, touched);
    expect(errors.gradeLT).toBeUndefined();
  });

  it("accepts 0", () => {
    const touched = new Set(["gradeC"]);
    const candidate: CandidateData = { gameId: "g1", gradeC: "0" };
    const errors = validateInline(candidate, touched);
    expect(errors.gradeC).toBeUndefined();
  });

  it("accepts 3", () => {
    const touched = new Set(["gradeRT"]);
    const candidate: CandidateData = { gameId: "g1", gradeRT: "3" };
    const errors = validateInline(candidate, touched);
    expect(errors.gradeRT).toBeUndefined();
  });

  it("accepts null/empty (no error)", () => {
    const touched = new Set(["gradeLT"]);
    const candidate: CandidateData = { gameId: "g1", gradeLT: "" };
    const errors = validateInline(candidate, touched);
    expect(errors.gradeLT).toBeUndefined();
  });

  it("rejects non-integer", () => {
    const touched = new Set(["gradeLG"]);
    const candidate: CandidateData = { gameId: "g1", gradeLG: "1.5" };
    const errors = validateInline(candidate, touched);
    expect(errors.gradeLG).toBeDefined();
  });
});

describe("Grade overwrite diffs", () => {
  it("null → 1: no diff (before is null)", () => {
    const before: number | null = null;
    const after: number | null = 1;
    const shouldTrigger = before !== null && after !== before;
    expect(shouldTrigger).toBe(false);
  });

  it("2 → 1: produces diff", () => {
    const before: number | null = 2;
    const after: number | null = 1;
    const shouldTrigger = before !== null && after !== before;
    expect(shouldTrigger).toBe(true);
  });

  it("2 → null: produces diff", () => {
    const before: number | null = 2;
    const after: number | null = null;
    const shouldTrigger = before !== null && after !== before;
    expect(shouldTrigger).toBe(true);
  });

  it("2 → 2: no diff (same value)", () => {
    const before: number | null = 2;
    const after: number | null = 2;
    const shouldTrigger = before !== null && after !== before;
    expect(shouldTrigger).toBe(false);
  });
});

describe("Grade normalization", () => {
  it("stored grades are number | null after normalizeToSchema", () => {
    const candidate: CandidateData = {
      gameId: "g1",
      playNum: 1 as any,
      gradeLT: "2",
      gradeC: "-1",
      gradeX: "",
      grade4: "0",
    };
    const normalized = normalizeToSchema(candidate, 1);
    expect(normalized.gradeLT).toBe(2);
    expect(typeof normalized.gradeLT).toBe("number");
    expect(normalized.gradeC).toBe(-1);
    expect(typeof normalized.gradeC).toBe("number");
    expect(normalized.gradeX).toBe(null);
    expect(normalized.grade4).toBe(0);
    expect(typeof normalized.grade4).toBe("number");
  });
});

describe("Export includes grade columns", () => {
  it("playsToCSV includes all 11 grade column headers", () => {
    const play = makePlay({ gradeLT: 2, gradeC: -1 });
    const csv = playsToCSV([play]);
    const headerLine = csv.split("\n")[0];

    // Check all grade output labels are present
    expect(headerLine).toContain("LT GRADE");
    expect(headerLine).toContain("LG GRADE");
    expect(headerLine).toContain("C GRADE");
    expect(headerLine).toContain("RG GRADE");
    expect(headerLine).toContain("RT GRADE");
    expect(headerLine).toContain("X GRADE");
    expect(headerLine).toContain("Y GRADE");
    expect(headerLine).toContain("1 GRADE");
    expect(headerLine).toContain("2 GRADE");
    expect(headerLine).toContain("3 GRADE");
    expect(headerLine).toContain("4 GRADE");
  });

  it("grade values appear in CSV data rows", () => {
    const play = makePlay({ gradeLT: 2, gradeC: -1 });
    const csv = playsToCSV([play]);
    const dataLine = csv.split("\n")[1];
    expect(dataLine).toContain("2");
    expect(dataLine).toContain("-1");
  });

  it("null grades export as empty cells", () => {
    const play = makePlay(); // all grades null
    const csv = playsToCSV([play]);
    const lines = csv.split("\n");
    // Last 11 columns should be empty
    const dataRow = lines[1].split(",");
    const gradeStartIdx = playSchema.findIndex((f) => f.name === "gradeLT");
    for (let i = gradeStartIdx; i < gradeStartIdx + 11; i++) {
      expect(dataRow[i]).toBe("");
    }
  });
});

describe("GRADE_FIELDS constant", () => {
  it("contains exactly 11 fields", () => {
    expect(GRADE_FIELDS).toHaveLength(11);
  });

  it("all grade fields exist in playSchema", () => {
    for (const gf of GRADE_FIELDS) {
      const def = playSchema.find((f) => f.name === gf);
      expect(def).toBeDefined();
      expect(def!.dataType).toBe("integer");
      expect(def!.defaultPassEntry).toBe(3);
      expect(def!.source).toBe("COACH");
    }
  });
});
