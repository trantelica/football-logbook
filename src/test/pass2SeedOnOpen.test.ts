/**
 * Pass 2 seed-on-open helpers.
 *
 * Verifies the deterministic source-selection rule used by selectSlot
 * and commitAndNext: the most recent prior committed offensive play
 * whose Pass 2 is complete (all 11 personnel positions committed).
 */

import { describe, it, expect } from "vitest";
import {
  findPriorPass2CompletePlay,
  countCommittedPersonnel,
  PERSONNEL_POSITIONS,
} from "@/engine/personnel";
import type { PlayRecord, SlotMeta } from "@/engine/types";

function makePlay(overrides: Partial<PlayRecord> = {}): PlayRecord {
  const base: Record<string, unknown> = {
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
    result: null,
    gainLoss: null,
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
    returner: null,
  };
  for (const pos of PERSONNEL_POSITIONS) base[pos] = null;
  return { ...(base as PlayRecord), ...overrides };
}

function complete11(extra: Partial<PlayRecord> = {}): Partial<PlayRecord> {
  const out: Record<string, unknown> = { ...extra };
  PERSONNEL_POSITIONS.forEach((p, i) => (out[p] = i + 1));
  return out as Partial<PlayRecord>;
}

function meta(playNum: number, committedFields: string[]): SlotMeta {
  return { gameId: "g1", playNum, committedFields };
}

describe("findPriorPass2CompletePlay", () => {
  it("returns the nearest prior O play with all 11 personnel committed", () => {
    const p1 = makePlay({ playNum: 1, ...complete11() });
    const p2 = makePlay({ playNum: 2, odk: "D" }); // defensive — skipped
    const p3 = makePlay({ playNum: 3, ...complete11() });
    const metas = new Map<number, SlotMeta>([
      [1, meta(1, [...PERSONNEL_POSITIONS])],
      [3, meta(3, [...PERSONNEL_POSITIONS])],
    ]);
    expect(findPriorPass2CompletePlay([p1, p2, p3], metas, 5)?.playNum).toBe(3);
  });

  it("skips offensive plays whose Pass 2 is not complete", () => {
    const p1 = makePlay({ playNum: 1, ...complete11() });
    const p2 = makePlay({ playNum: 2, posLT: 7, posLG: 8 }); // partial only
    const metas = new Map<number, SlotMeta>([
      [1, meta(1, [...PERSONNEL_POSITIONS])],
      [2, meta(2, ["posLT", "posLG"])],
    ]);
    expect(findPriorPass2CompletePlay([p1, p2], metas, 5)?.playNum).toBe(1);
  });

  it("returns null when no prior O play has Pass 2 complete", () => {
    const p1 = makePlay({ playNum: 1, posLT: 7 });
    const metas = new Map<number, SlotMeta>([[1, meta(1, ["posLT"])]]);
    expect(findPriorPass2CompletePlay([p1], metas, 5)).toBeNull();
  });

  it("does not return plays at or after beforePlayNum", () => {
    const p3 = makePlay({ playNum: 3, ...complete11() });
    const p5 = makePlay({ playNum: 5, ...complete11() });
    const metas = new Map<number, SlotMeta>([
      [3, meta(3, [...PERSONNEL_POSITIONS])],
      [5, meta(5, [...PERSONNEL_POSITIONS])],
    ]);
    expect(findPriorPass2CompletePlay([p3, p5], metas, 5)?.playNum).toBe(3);
  });

  it("ignores defensive plays even when 11 fields happen to be present", () => {
    const p1 = makePlay({ playNum: 1, odk: "D", ...complete11() });
    const metas = new Map<number, SlotMeta>([[1, meta(1, [...PERSONNEL_POSITIONS])]]);
    expect(findPriorPass2CompletePlay([p1], metas, 5)).toBeNull();
  });
});

describe("countCommittedPersonnel", () => {
  it("returns 0 when meta is missing", () => {
    expect(countCommittedPersonnel(undefined)).toBe(0);
  });

  it("returns the number of personnel positions present in committedFields", () => {
    expect(countCommittedPersonnel(meta(1, ["posLT", "posC", "offPlay"]))).toBe(2);
  });

  it("returns 11 when all positions are committed", () => {
    expect(countCommittedPersonnel(meta(1, [...PERSONNEL_POSITIONS]))).toBe(11);
  });
});
