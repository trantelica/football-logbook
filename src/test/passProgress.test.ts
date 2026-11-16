/**
 * Per-pass progress.
 *
 * Guards against a Pass 1 gate creeping back in. The passes are independent:
 * a game worked only in Pass 2 (personnel) and Pass 3 (blocking), with its
 * play details left in Hudl, must show that work rather than read as
 * untouched.
 */
import { describe, it, expect } from "vitest";
import {
  DEFENSE_FIELD_NAMES, passFlags, isFullyLogged, hasCoachWork, isPassWorkCommitted, passTally,
} from "@/engine/passProgress";
import { deriveSlotMeta } from "@/engine/slotMetaDerive";
import { PERSONNEL_POSITIONS } from "@/engine/personnel";
import { playSchema } from "@/engine/schema";
import type { PlayRecord, SlotMeta } from "@/engine/types";

function play(playNum: number, extra: Record<string, unknown> = {}): PlayRecord {
  const p: Record<string, unknown> = {};
  for (const f of playSchema) p[f.name] = null;
  return { ...p, gameId: "g1", playNum, ...extra } as unknown as PlayRecord;
}
const SCAFFOLD_O = { qtr: 1, odk: "O", series: 1 };
const DETAILS = { yardLn: -20, dn: 1, dist: 10, offPlay: "26 Punch", result: "Rush", gainLoss: 4 };
const PERSONNEL = Object.fromEntries(PERSONNEL_POSITIONS.map((pos, i) => [pos, i + 1]));
const GRADES = { gradeLT: 1, gradeC: -1 };

/** Play plus the metadata a commit would have written for it. */
function logged(playNum: number, extra: Record<string, unknown>): [PlayRecord, SlotMeta] {
  const p = play(playNum, extra);
  return [p, deriveSlotMeta(p)];
}
function metaMap(entries: Array<[PlayRecord, SlotMeta]>) {
  return new Map(entries.map(([p, m]) => [p.playNum, m]));
}

describe("passFlags", () => {
  it("lights personnel and blocking without play details", () => {
    const [p, m] = logged(2, { ...SCAFFOLD_O, ...PERSONNEL, ...GRADES });
    expect(passFlags(p, m)).toEqual([false, true, true]);
  });

  it("lights only play details when that is all that is logged", () => {
    const [p, m] = logged(3, { ...SCAFFOLD_O, ...DETAILS });
    expect(passFlags(p, m)).toEqual([true, false, false]);
  });

  it("shows nothing for an untouched scaffold slot", () => {
    const [p, m] = logged(4, SCAFFOLD_O);
    expect(passFlags(p, m)).toEqual([false, false, false]);
  });

  it("fills all three for a logged non-offensive play, which has no other work", () => {
    const [p, m] = logged(5, { qtr: 1, odk: "K", result: "Touchback", gainLoss: 0 });
    expect(passFlags(p, m)).toEqual([true, true, true]);
    const [q, n] = logged(6, { qtr: 1, odk: "K" });
    expect(passFlags(q, n)).toEqual([false, false, false]);
  });
});

describe("hasCoachWork", () => {
  it("counts a play with only personnel, only grades or only defensive fields", () => {
    expect(hasCoachWork(...logged(1, { ...SCAFFOLD_O, ...PERSONNEL }))).toBe(true);
    expect(hasCoachWork(...logged(2, { ...SCAFFOLD_O, ...GRADES }))).toBe(true);
    expect(hasCoachWork(...logged(3, { qtr: 1, odk: "D", tackler1: 44 }))).toBe(true);
  });

  it("does not count scaffolding, which every slot of a new game has", () => {
    expect(hasCoachWork(...logged(1, SCAFFOLD_O))).toBe(false);
    expect(hasCoachWork(play(2, SCAFFOLD_O), undefined)).toBe(false);
  });
});

describe("isPassWorkCommitted", () => {
  const [p, m] = logged(7, { ...SCAFFOLD_O, ...PERSONNEL });
  it("answers for the pass the coach is in", () => {
    expect(isPassWorkCommitted(p, m, 1)).toBe(false);
    expect(isPassWorkCommitted(p, m, 2)).toBe(true);
    expect(isPassWorkCommitted(p, m, 3)).toBe(false);
  });

  it("does not call a non-offensive play committed in Pass 2", () => {
    const [k, km] = logged(8, { qtr: 1, odk: "K" });
    expect(isPassWorkCommitted(k, km, 2)).toBe(false);
  });
});

describe("passTally", () => {
  // The shape of a real exported game: personnel on every offensive play,
  // grades on most, play details on none, defense and kicks untouched.
  const game = [
    logged(1, { qtr: 1, odk: "K" }),
    logged(2, { ...SCAFFOLD_O, ...PERSONNEL, ...GRADES }),
    logged(3, { ...SCAFFOLD_O, ...PERSONNEL, ...GRADES }),
    logged(4, { ...SCAFFOLD_O, ...PERSONNEL }),
    logged(5, { qtr: 1, odk: "D" }),
  ];
  const plays = game.map(([p]) => p);
  const metas = metaMap(game);

  it("counts personnel over offensive plays in Pass 2", () => {
    expect(passTally(plays, metas, 2)).toMatchObject({ done: 3, total: 3 });
  });

  it("counts graded plays over offensive plays in Pass 3", () => {
    expect(passTally(plays, metas, 3)).toMatchObject({ done: 2, total: 3 });
  });

  it("counts defensive plays in Pass 4", () => {
    expect(passTally(plays, metas, 4)).toMatchObject({ done: 0, total: 1 });
  });

  it("counts plays finished in every pass elsewhere", () => {
    expect(passTally(plays, metas, 1)).toMatchObject({ done: 0, total: 5 });
    const full = logged(9, { ...SCAFFOLD_O, ...DETAILS, ...PERSONNEL, ...GRADES });
    expect(isFullyLogged(...full)).toBe(true);
    expect(passTally([full[0]], metaMap([full]), 1)).toMatchObject({ done: 1, total: 1 });
  });
});

describe("DEFENSE_FIELD_NAMES", () => {
  it("covers the Pass 4 fields and nothing from the offensive passes", () => {
    expect(DEFENSE_FIELD_NAMES).toEqual(expect.arrayContaining(["defFront", "defStrength", "coverage", "tackler1", "dawg"]));
    expect(DEFENSE_FIELD_NAMES).not.toContain("result");
    expect(DEFENSE_FIELD_NAMES).not.toContain("posLT");
  });
});
