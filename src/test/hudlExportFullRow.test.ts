/**
 * Hudl export — full-row output including Pass 2 and Pass 3 content.
 *
 * Guards the contract that the CSV reflects what is in the database. The export
 * path previously refused outright when validateForExport reported any issue,
 * so one out-of-enum value anywhere in a game produced no files at all.
 * Validation is now advisory; these tests pin the row content so a regression
 * in either direction is caught.
 */

import { describe, it, expect } from "vitest";
import { createSlots } from "@/engine/slotEngine";
import { HUDL_HEADERS, toHudlCsv, validateForExport } from "@/engine/hudlExport";
import type { PlayRecord } from "@/engine/types";

function gameOf(totalPlays: number): PlayRecord[] {
  return createSlots("g1", totalPlays, { "1": 1 }, [
    { odk: "O", startPlay: 1, endPlay: totalPlays },
  ]).slots;
}

/** A play carrying Pass 1 situation, Pass 2 personnel, and Pass 3 grades. */
function fullyLoggedPlay(base: PlayRecord): PlayRecord {
  return {
    ...base,
    // dn is a string in PlayRecord ("1".."4"), dist/yardLn are numbers.
    dn: "1", dist: 10, yardLn: -25, hash: "M",
    offForm: "Black", offPlay: "26 Punch", motion: "3 Across",
    result: "Rush", gainLoss: 4, eff: "Y", rusher: 4,
    offStrength: "R", personnel: "21", playType: "Run", playDir: "R", motionDir: "L",
    posLT: 77, posLG: 55, posC: 60, posRG: 65, posRT: 70,
    posX: 11, posY: 84, pos1: 7, pos2: 22, pos3: 33, pos4: 44,
    gradeLT: 1, gradeLG: 1, gradeC: 2, gradeRG: -1, gradeRT: 0,
    gradeX: 1, gradeY: 1, grade1: 2, grade2: 1, grade3: 0, grade4: -2,
  } as PlayRecord;
}

function rowFor(csv: string, playNum: number): string[] {
  const line = csv.split("\n").find((l) => l.startsWith(`${playNum},`));
  if (!line) throw new Error(`no row for play ${playNum}`);
  return line.split(",");
}

function columnIndex(label: string): number {
  const i = HUDL_HEADERS.findIndex((h) => h.label === label);
  if (i < 0) throw new Error(`no column labelled ${label}`);
  return i;
}

describe("toHudlCsv with Pass 2 / Pass 3 content", () => {
  const plays = gameOf(3);
  plays[0] = fullyLoggedPlay(plays[0]);
  const csv = toHudlCsv(plays);

  it("emits a row for every slot, not just the logged ones", () => {
    // Header + 3 slots. Hudl aligns rows to clips by play number, so unlogged
    // slots must still appear.
    expect(csv.split("\n")).toHaveLength(4);
  });

  it("writes Pass 2 personnel jerseys into their columns", () => {
    const row = rowFor(csv, 1);
    expect(row[columnIndex("LT")]).toBe("77");
    expect(row[columnIndex("C")]).toBe("60");
    expect(row[columnIndex("Y")]).toBe("84");
    expect(row[columnIndex("4")]).toBe("44");
  });

  it("writes Pass 3 grades into their columns, including zero and negatives", () => {
    const row = rowFor(csv, 1);
    expect(row[columnIndex("LT GRADE")]).toBe("1");
    expect(row[columnIndex("RG GRADE")]).toBe("-1");
    // 0 is a real grade and must not be dropped as falsy.
    expect(row[columnIndex("RT GRADE")]).toBe("0");
    expect(row[columnIndex("4 GRADE")]).toBe("-2");
  });

  it("writes Pass 1 and derived fields", () => {
    const row = rowFor(csv, 1);
    expect(row[columnIndex("OFF FORM")]).toBe("Black");
    expect(row[columnIndex("GN/LS")]).toBe("4");
    expect(row[columnIndex("PERSONNEL")]).toBe("21");
    expect(row[columnIndex("PLAY DIR")]).toBe("R");
  });

  it("leaves unlogged slots blank apart from their scaffolded identity", () => {
    const row = rowFor(csv, 2);
    expect(row[columnIndex("PLAY #")]).toBe("2");
    expect(row[columnIndex("ODK")]).toBe("O");
    expect(row[columnIndex("OFF FORM")]).toBe("");
    expect(row[columnIndex("LT GRADE")]).toBe("");
  });
});

describe("validateForExport is advisory", () => {
  it("flags an out-of-enum value without preventing the row from being written", () => {
    const plays = gameOf(2);
    // "Rush" is a valid RESULT but not a valid PLAY TYPE (which allows "Run").
    // An easy real-world mix-up, and it used to cost the entire export.
    plays[0] = { ...fullyLoggedPlay(plays[0]), playType: "Rush" } as PlayRecord;

    const validation = validateForExport(plays);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.field === "playType")).toBe(true);

    // The CSV is still complete and still carries the offending value, so the
    // coach can see what needs fixing rather than being handed nothing.
    const csv = toHudlCsv(plays);
    expect(csv.split("\n")).toHaveLength(3);
    expect(rowFor(csv, 1)[columnIndex("PLAY TYPE")]).toBe("Rush");
    expect(rowFor(csv, 1)[columnIndex("LT")]).toBe("77");
  });
});

describe("export with no play rows", () => {
  /**
   * The Hudl Export button used to be disabled on `committedPlays.length === 0`.
   * That list lives in the transaction context, starts empty, and fills
   * asynchronously — while the export handler never reads it, querying the
   * database directly instead. So the button was dead during the load window,
   * dead for a game with no scaffolded slots, and dead permanently if the load
   * rejected, even when the database had rows to export.
   *
   * The gate is gone. These pin the behaviour it was hiding: an empty play list
   * is a valid input that produces a valid, header-only file.
   */
  it("produces the header row and nothing else", () => {
    const csv = toHudlCsv([]);
    expect(csv.split("\n")).toHaveLength(1);
    expect(csv).toBe(HUDL_HEADERS.map((h) => h.label).join(","));
  });

  it("reports no errors, so an empty game exports cleanly rather than warning", () => {
    const validation = validateForExport([]);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });
});
