import { describe, it, expect } from "vitest";
import {
  buildSessionArchive,
  validateArchiveMinimum,
  SESSION_ARCHIVE_FORMAT_VERSION,
  type BuildSessionArchiveParams,
} from "@/engine/sessionArchiveExport";
import type { PlayRecord, CoachNote } from "@/engine/types";
import { APP_VERSION, SCHEMA_VERSION } from "@/engine/schema";

function makePlay(overrides: Partial<PlayRecord> & { playNum: number; gameId: string }): PlayRecord {
  const base: PlayRecord = {
    gameId: "g1", playNum: 1,
    qtr: null, odk: null, series: null, yardLn: null, dn: null, dist: null,
    hash: null, offForm: null, offPlay: null, motion: null, result: null,
    gainLoss: null, twoMin: null, rusher: null, passer: null, receiver: null,
    penalty: null, penYards: null, eff: null, offStrength: null, personnel: null,
    playType: null, playDir: null, motionDir: null, patTry: null,
    posLT: null, posLG: null, posC: null, posRG: null, posRT: null,
    posX: null, posY: null, pos1: null, pos2: null, pos3: null, pos4: null,
    returner: null,
    gradeLT: null, gradeLG: null, gradeC: null, gradeRG: null, gradeRT: null,
    gradeX: null, gradeY: null, grade1: null, grade2: null, grade3: null, grade4: null,
  };
  return { ...base, ...overrides };
}

function makeNote(overrides: Partial<CoachNote>): CoachNote {
  return {
    id: "n1", gameId: "g1", playNum: 1, text: "test",
    createdAt: "2025-01-01T00:00:00Z", updatedAt: null, deletedAt: null,
    ...overrides,
  };
}

const defaultParams: BuildSessionArchiveParams = {
  gameMeta: { gameId: "g1", opponent: "Rival", date: "2025-09-01" },
  plays: [],
  notes: [],
  lookupsSnapshot: { offForm: null, offPlay: null, motion: null, roster: null },
  seasonRevision: 3,
  exportedAtISO: "2025-09-01T12:00:00Z",
};

describe("sessionArchiveExport", () => {
  // T1: Sorting
  it("sorts plays by playNum ascending", () => {
    const plays = [makePlay({ gameId: "g1", playNum: 5 }), makePlay({ gameId: "g1", playNum: 1 }), makePlay({ gameId: "g1", playNum: 3 })];
    const archive = buildSessionArchive({ ...defaultParams, plays });
    expect(archive.plays.map((p) => p.playNum)).toEqual([1, 3, 5]);
  });

  // T2: No mutation
  it("does not mutate input arrays", () => {
    const plays = [makePlay({ gameId: "g1", playNum: 3 }), makePlay({ gameId: "g1", playNum: 1 })];
    const notes = [makeNote({ id: "n1" })];
    const playsCopy = JSON.parse(JSON.stringify(plays));
    const notesCopy = JSON.parse(JSON.stringify(notes));
    buildSessionArchive({ ...defaultParams, plays, notes });
    expect(plays).toEqual(playsCopy);
    expect(notes).toEqual(notesCopy);
  });

  // T3: Counts
  it("counts match array lengths", () => {
    const plays = [makePlay({ gameId: "g1", playNum: 1 }), makePlay({ gameId: "g1", playNum: 2 })];
    const notes = [makeNote({ id: "n1" }), makeNote({ id: "n2", playNum: 2 })];
    const archive = buildSessionArchive({ ...defaultParams, plays, notes });
    expect(archive.counts.plays).toBe(2);
    expect(archive.counts.notes).toBe(2);
  });

  // T4: Keys/types present
  it("has correct meta keys and types", () => {
    const archive = buildSessionArchive(defaultParams);
    expect(archive.meta.appVersion).toBe(APP_VERSION);
    expect(archive.meta.exportFormatVersion).toBe(SESSION_ARCHIVE_FORMAT_VERSION);
    expect(archive.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(archive.meta.seasonRevision).toBe(3);
    expect(typeof archive.meta.exportedAt).toBe("string");
    expect(archive.game.gameId).toBe("g1");
    expect(archive.lookups).toHaveProperty("offForm");
    expect(archive.lookups).toHaveProperty("offPlay");
    expect(archive.lookups).toHaveProperty("motion");
    expect(archive.lookups).toHaveProperty("roster");
  });

  // T4b: lookupStoreVersion defaults to "unknown"
  it("defaults lookupStoreVersion to unknown", () => {
    const archive = buildSessionArchive(defaultParams);
    expect(archive.meta.lookupStoreVersion).toBe("unknown");
  });

  // T4c: game.score is null
  it("game.score is null", () => {
    const archive = buildSessionArchive(defaultParams);
    expect(archive.game.score).toBeNull();
  });

  // T5: Validation — missing playNum
  it("rejects plays with missing playNum", () => {
    const plays = [{ ...makePlay({ gameId: "g1", playNum: 1 }), playNum: null as any }];
    const result = validateArchiveMinimum(plays);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("playNum");
  });

  // T5b: Validation — duplicate playNum
  it("rejects duplicate playNums", () => {
    const plays = [makePlay({ gameId: "g1", playNum: 1 }), makePlay({ gameId: "g1", playNum: 1 })];
    const result = validateArchiveMinimum(plays);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });

  // T5c: Validation — valid plays pass
  it("passes valid plays", () => {
    const plays = [makePlay({ gameId: "g1", playNum: 1 }), makePlay({ gameId: "g1", playNum: 2 })];
    const result = validateArchiveMinimum(plays);
    expect(result.valid).toBe(true);
  });

  // T6: Lookup snapshot passthrough
  it("includes provided lookup snapshot in archive", () => {
    const snapshot = {
      offForm: { seasonId: "s1", fieldName: "offForm", values: ["Shotgun"], updatedAt: "2025-01-01T00:00:00Z" },
      offPlay: null,
      motion: null,
      roster: [{ seasonId: "s1", jerseyNumber: 12, playerName: "Tom" }],
    };
    const archive = buildSessionArchive({ ...defaultParams, lookupsSnapshot: snapshot });
    expect(archive.lookups.offForm).toEqual(snapshot.offForm);
    expect(archive.lookups.roster).toEqual(snapshot.roster);
    expect(archive.lookups.offPlay).toBeNull();
  });
});
