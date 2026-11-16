/**
 * Commit metadata recovered from stored plays.
 *
 * Guards the restore path: a game restored from a season package or session
 * archive has no slot_meta rows, and overwrite review reads slot_meta. If the
 * metadata cannot be rebuilt, the first edit to a restored play overwrites
 * committed data with no review.
 */
import { describe, it, expect } from "vitest";
import {
  deriveCommittedFields, deriveSlotMeta, fillMissingSlotMeta, inferFieldSizeFromPlays,
} from "@/engine/slotMetaDerive";
import { isPass1Complete, isPass2Complete, PERSONNEL_POSITIONS } from "@/engine/personnel";
import { playSchema } from "@/engine/schema";
import type { PlayRecord, SlotMeta } from "@/engine/types";

function play(playNum: number, extra: Record<string, unknown> = {}): PlayRecord {
  const p: Record<string, unknown> = {};
  for (const f of playSchema) p[f.name] = null;
  return { ...p, gameId: "g1", playNum, ...extra } as unknown as PlayRecord;
}

const LOGGED = { qtr: 1, odk: "O", series: 1, yardLn: -20, dn: 1, dist: 10, offPlay: "26 Punch", result: "Rush", gainLoss: 0 };

describe("deriveCommittedFields", () => {
  it("lists exactly the fields that hold a value", () => {
    const fields = deriveCommittedFields(play(3, { qtr: 2, odk: "O", dist: 7 }));
    expect([...fields].sort()).toEqual(["dist", "odk", "playNum", "qtr"]);
  });

  it("counts zero as a value and skips null, undefined and empty strings", () => {
    const fields = deriveCommittedFields(play(1, { gainLoss: 0, hash: "", motion: undefined }));
    expect(fields).toContain("gainLoss");
    expect(fields).not.toContain("hash");
    expect(fields).not.toContain("motion");
  });

  it("never reports a field outside the play schema", () => {
    const fields = deriveCommittedFields(play(1, { notAField: "x" }));
    expect(fields).not.toContain("gameId");
    expect(fields).not.toContain("notAField");
  });
});

describe("deriveSlotMeta", () => {
  it("marks a fully logged play as Pass 1 complete", () => {
    const p = play(4, LOGGED);
    const meta = deriveSlotMeta(p);
    expect(meta).toMatchObject({ gameId: "g1", playNum: 4, pass1Complete: true });
    expect(isPass1Complete(p, meta)).toBe(true);
  });

  it("marks a play with all eleven players as Pass 2 complete, without Pass 1", () => {
    const personnel = Object.fromEntries(PERSONNEL_POSITIONS.map((pos, i) => [pos, i + 1]));
    const p = play(5, { qtr: 1, odk: "O", series: 1, ...personnel });
    const meta = deriveSlotMeta(p);
    expect(isPass2Complete(p, meta)).toBe(true);
    expect(isPass1Complete(p, meta)).toBe(false);
  });

  it("leaves an untouched scaffold slot incomplete", () => {
    const p = play(6, { qtr: 1, odk: "O", series: 1 });
    expect(deriveSlotMeta(p)).toMatchObject({ pass1Complete: false, pass2Complete: false });
  });
});

describe("fillMissingSlotMeta", () => {
  it("keeps stored metadata and derives only what is missing", () => {
    const stored: SlotMeta = { gameId: "g1", playNum: 1, committedFields: ["playNum", "qtr"] };
    const map = fillMissingSlotMeta([play(1, LOGGED), play(2, LOGGED)], [stored]);
    expect(map.get(1)).toBe(stored);
    expect(map.get(2)?.committedFields).toContain("dist");
  });

  it("protects every play of a game that arrived with no metadata at all", () => {
    const map = fillMissingSlotMeta([play(1, LOGGED), play(2, { qtr: 1, odk: "D" })], []);
    expect(map.size).toBe(2);
    // The overwrite check walks committedFields; an empty list protects nothing.
    expect(map.get(1)?.committedFields).toEqual(expect.arrayContaining(["dn", "dist", "result", "gainLoss"]));
  });
});

describe("inferFieldSizeFromPlays", () => {
  it("recognises a 100-yard field from a yard line beyond the 40", () => {
    expect(inferFieldSizeFromPlays([play(1, { yardLn: -20 }), play(2, { yardLn: 45 })])).toBe(100);
    expect(inferFieldSizeFromPlays([play(1, { yardLn: -50 })])).toBe(100);
  });

  it("claims nothing when the plays fit either field", () => {
    expect(inferFieldSizeFromPlays([play(1, { yardLn: -40 }), play(2, { yardLn: 12 })])).toBeUndefined();
    expect(inferFieldSizeFromPlays([play(1)])).toBeUndefined();
    expect(inferFieldSizeFromPlays([])).toBeUndefined();
  });
});
