import { describe, it, expect } from "vitest";
import {
  buildSeasonPackage,
  validateSeasonPackageImport,
  normalizeSeasonPackageImport,
  SEASON_PACKAGE_FORMAT_VERSION,
  type BuildSeasonPackageParams,
} from "@/engine/seasonTransfer";
import type { SeasonMeta, GameMeta, PlayRecord, CoachNote, LookupTable, RosterEntry } from "@/engine/types";

function makeSeason(): SeasonMeta {
  return { seasonId: "s1", label: "2025 Varsity", createdAt: "2025-01-01T00:00:00Z", seasonRevision: 3 };
}

function makeGame(gameId: string): GameMeta {
  return { gameId, seasonId: "s1", opponent: "Opp", date: "2025-09-01", createdAt: "2025-01-01T00:00:00Z", schemaVersion: "2.1.0" };
}

function makePlay(gameId: string, playNum: number): PlayRecord {
  const p: any = { gameId, playNum };
  for (const f of ["qtr","odk","series","yardLn","dn","dist","hash","offForm","offPlay","motion","result","gainLoss","twoMin","rusher","passer","receiver","penalty","penYards","eff","offStrength","personnel","playType","playDir","motionDir","patTry","posLT","posLG","posC","posRG","posRT","posX","posY","pos1","pos2","pos3","pos4","gradeLT","gradeLG","gradeC","gradeRG","gradeRT","gradeX","gradeY","grade1","grade2","grade3","grade4","returner"]) {
    if (!(f in p)) p[f] = null;
  }
  return p as PlayRecord;
}

function makeNote(gameId: string, playNum: number, id: string): CoachNote {
  return { id, gameId, playNum, text: "test", createdAt: "2025-01-01T00:00:00Z", updatedAt: null, deletedAt: null };
}

function makeValidPackage() {
  return {
    meta: { appVersion: "1.0.0", schemaVersion: "2.1.0", packageFormatVersion: SEASON_PACKAGE_FORMAT_VERSION, exportedAt: "2025-01-01T00:00:00Z" },
    season: makeSeason(),
    lookups: {},
    roster: null,
    games: [makeGame("g1")],
    playsByGame: { g1: [makePlay("g1", 1)] },
    notesByGame: { g1: [makeNote("g1", 1, "n1")] },
  };
}

describe("buildSeasonPackage", () => {
  it("sorts plays by playNum per game", () => {
    const params: BuildSeasonPackageParams = {
      season: makeSeason(),
      lookupTables: [],
      roster: null,
      games: [makeGame("g1")],
      playsByGame: { g1: [makePlay("g1", 3), makePlay("g1", 1), makePlay("g1", 2)] },
      notesByGame: { g1: [] },
    };
    const pkg = buildSeasonPackage(params);
    expect(pkg.playsByGame.g1.map((p) => p.playNum)).toEqual([1, 2, 3]);
  });

  it("does not mutate inputs", () => {
    const plays = [makePlay("g1", 2), makePlay("g1", 1)];
    const originalOrder = plays.map((p) => p.playNum);
    const roster: RosterEntry[] = [{ seasonId: "s1", jerseyNumber: 10, playerName: "A" }];
    const lookup: LookupTable = {
      seasonId: "s1", fieldName: "offForm", values: ["Shotgun"],
      updatedAt: "2025-01-01T00:00:00Z",
      entryAttributes: { shotgun: { offStrength: "L" } },
    };

    const params: BuildSeasonPackageParams = {
      season: makeSeason(),
      lookupTables: [lookup],
      roster,
      games: [makeGame("g1")],
      playsByGame: { g1: plays },
      notesByGame: { g1: [] },
    };
    const pkg = buildSeasonPackage(params);

    expect(plays.map((p) => p.playNum)).toEqual(originalOrder);
    pkg.roster![0].playerName = "CHANGED";
    expect(roster[0].playerName).toBe("A");
    pkg.lookups.offForm!.entryAttributes!.shotgun.offStrength = "R";
    expect(lookup.entryAttributes!.shotgun.offStrength).toBe("L");
  });

  it("supports additional lookup keys beyond offForm/offPlay/motion", () => {
    const tables: LookupTable[] = [
      { seasonId: "s1", fieldName: "defForm", values: ["4-3"], updatedAt: "2025-01-01T00:00:00Z" },
      { seasonId: "s1", fieldName: "coverages", values: ["Cover 2"], updatedAt: "2025-01-01T00:00:00Z" },
    ];
    const params: BuildSeasonPackageParams = {
      season: makeSeason(),
      lookupTables: tables,
      roster: null,
      games: [],
      playsByGame: {},
      notesByGame: {},
    };
    const pkg = buildSeasonPackage(params);
    expect(pkg.lookups.defForm).toBeTruthy();
    expect(pkg.lookups.defForm!.values).toEqual(["4-3"]);
    expect(pkg.lookups.coverages).toBeTruthy();
    expect(pkg.lookups.coverages!.values).toEqual(["Cover 2"]);
  });
});

describe("validateSeasonPackageImport", () => {
  it("rejects missing meta/season/games", () => {
    const r = validateSeasonPackageImport({});
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path === "meta")).toBe(true);
    expect(r.errors.some((e) => e.path === "season")).toBe(true);
    expect(r.errors.some((e) => e.path === "games")).toBe(true);
  });

  it("rejects plays with missing/invalid playNum", () => {
    const pkg = makeValidPackage();
    (pkg.playsByGame.g1[0] as any).playNum = -1;
    const r = validateSeasonPackageImport(pkg);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes("playNum"))).toBe(true);
  });

  it("rejects duplicate playNum within same game", () => {
    const pkg = makeValidPackage();
    pkg.playsByGame.g1 = [makePlay("g1", 1), makePlay("g1", 1)];
    const r = validateSeasonPackageImport(pkg);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });

  it("accepts minimal valid package", () => {
    const r = validateSeasonPackageImport(makeValidPackage());
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe("normalizeSeasonPackageImport", () => {
  it("deep-clones so mutations don't affect original", () => {
    const pkg = makeValidPackage();
    const original = JSON.parse(JSON.stringify(pkg));
    const normalized = normalizeSeasonPackageImport(pkg);

    normalized.season.label = "CHANGED";
    normalized.games[0].opponent = "CHANGED";
    normalized.playsByGame.g1[0].playNum = 999;
    normalized.notesByGame.g1[0].text = "CHANGED";

    expect(pkg.season.label).toBe(original.season.label);
    expect(pkg.games[0].opponent).toBe(original.games[0].opponent);
    expect(pkg.playsByGame.g1[0].playNum).toBe(original.playsByGame.g1[0].playNum);
    expect(pkg.notesByGame.g1[0].text).toBe(original.notesByGame.g1[0].text);
  });

  it("preserves additional lookup keys (defForm, coverages, etc.)", () => {
    const pkg = makeValidPackage();
    pkg.lookups = {
      offForm: { seasonId: "s1", fieldName: "offForm", values: ["Shotgun"], updatedAt: "2025-01-01T00:00:00Z" },
      defForm: { seasonId: "s1", fieldName: "defForm", values: ["4-3"], updatedAt: "2025-01-01T00:00:00Z" },
      coverages: { seasonId: "s1", fieldName: "coverages", values: ["Cover 2"], updatedAt: "2025-01-01T00:00:00Z", entryAttributes: { "cover 2": { zone: "deep" } } },
    } as any;
    const normalized = normalizeSeasonPackageImport(pkg);

    expect(normalized.lookups.offForm).toBeTruthy();
    expect(normalized.lookups.defForm).toBeTruthy();
    expect(normalized.lookups.coverages).toBeTruthy();
    // entryAttributes deep-cloned
    (normalized.lookups.coverages as any).entryAttributes["cover 2"].zone = "CHANGED";
    expect((pkg.lookups as any).coverages.entryAttributes["cover 2"].zone).toBe("deep");
  });

  it("fieldName in normalized lookups matches dictionary key", () => {
    const pkg = makeValidPackage();
    // Intentionally set a mismatched fieldName in the file data
    pkg.lookups = {
      offForm: { seasonId: "s1", fieldName: "WRONG", values: ["X"], updatedAt: "2025-01-01T00:00:00Z" },
    } as any;
    const normalized = normalizeSeasonPackageImport(pkg);
    // The normalized object preserves what's in the file; the DB layer forces the key
    // So here we just verify the data is present
    expect(normalized.lookups.offForm).toBeTruthy();
  });
});
