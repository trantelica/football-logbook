import { describe, it, expect } from "vitest";
import {
  normalizeAlias,
  validateAliasMap,
  resolveToCanonicalPos,
  getAliasFor,
  normalizePatchKeysToCanonical,
  type PositionAliasMap,
} from "../engine/positionAliases";
import { diffConfig, buildDefaultConfig, type SeasonConfig } from "../engine/configStore";

describe("normalizeAlias", () => {
  it("trims and uppercases", () => {
    expect(normalizeAlias("  qb  ")).toBe("QB");
    expect(normalizeAlias("Qb")).toBe("QB");
    expect(normalizeAlias("")).toBe("");
    expect(normalizeAlias(null)).toBe("");
    expect(normalizeAlias(undefined)).toBe("");
  });
});

describe("validateAliasMap", () => {
  it("allows empty map", () => {
    expect(validateAliasMap({})).toEqual({});
  });

  it("allows distinct aliases", () => {
    const map: PositionAliasMap = { pos1: "QB", pos2: "H", pos3: "F" };
    expect(validateAliasMap(map)).toEqual({});
  });

  it("rejects duplicate aliases (case-insensitive)", () => {
    const map: PositionAliasMap = { pos1: "QB", pos2: "qb" };
    const errs = validateAliasMap(map);
    expect(errs.pos2).toMatch(/already used/);
  });

  it("rejects alias colliding with another canonical position label (RG for slot 3)", () => {
    const map: PositionAliasMap = { pos3: "RG" };
    const errs = validateAliasMap(map);
    expect(errs.pos3).toMatch(/canonical position label/);
  });

  it("rejects alias matching its OWN canonical label (strictest mode)", () => {
    const map: PositionAliasMap = { pos1: "1" };
    expect(validateAliasMap(map).pos1).toMatch(/canonical position label/);
  });

  it("ignores blank and whitespace-only aliases", () => {
    const map: PositionAliasMap = { pos1: "", pos2: "   " };
    expect(validateAliasMap(map)).toEqual({});
  });
});

describe("resolveToCanonicalPos", () => {
  const map: PositionAliasMap = { pos1: "QB", pos3: "F", pos2: "H" };

  it("resolves canonical labels (case-insensitive)", () => {
    expect(resolveToCanonicalPos("1", map)).toBe("pos1");
    expect(resolveToCanonicalPos("rg", map)).toBe("posRG");
    expect(resolveToCanonicalPos("Y", map)).toBe("posY");
  });

  it("resolves aliases (case-insensitive, trimmed)", () => {
    expect(resolveToCanonicalPos("QB", map)).toBe("pos1");
    expect(resolveToCanonicalPos("  qb ", map)).toBe("pos1");
    expect(resolveToCanonicalPos("f", map)).toBe("pos3");
    expect(resolveToCanonicalPos("H", map)).toBe("pos2");
  });

  it("returns null for unknown tokens or empty input", () => {
    expect(resolveToCanonicalPos("ZZZ", map)).toBeNull();
    expect(resolveToCanonicalPos("", map)).toBeNull();
    expect(resolveToCanonicalPos(null, map)).toBeNull();
  });

  it("works without alias map", () => {
    expect(resolveToCanonicalPos("LT", undefined)).toBe("posLT");
    expect(resolveToCanonicalPos("QB", undefined)).toBeNull();
  });
});

describe("getAliasFor", () => {
  it("returns alias text or null", () => {
    const map: PositionAliasMap = { pos1: "QB", pos2: "" };
    expect(getAliasFor("pos1", map)).toBe("QB");
    expect(getAliasFor("pos2", map)).toBeNull();
    expect(getAliasFor("pos3", map)).toBeNull();
    expect(getAliasFor("pos1", undefined)).toBeNull();
  });
});

describe("normalizePatchKeysToCanonical", () => {
  const map: PositionAliasMap = { pos1: "QB", pos3: "F" };

  it("passes canonical pos* keys through", () => {
    const { patch } = normalizePatchKeysToCanonical({ pos1: 7, posLT: 55 }, map);
    expect(patch).toEqual({ pos1: 7, posLT: 55 });
  });

  it("translates alias keys to canonical pos* keys", () => {
    const { patch } = normalizePatchKeysToCanonical({ QB: 7, F: 22 }, map);
    expect(patch).toEqual({ pos1: 7, pos3: 22 });
  });

  it("translates canonical-label keys to canonical field keys", () => {
    const { patch } = normalizePatchKeysToCanonical({ RG: 64, "1": 7 }, map);
    expect(patch).toEqual({ posRG: 64, pos1: 7 });
  });

  it("leaves unrelated keys untouched", () => {
    const { patch } = normalizePatchKeysToCanonical(
      { offForm: "I", QB: 7, randomField: "x" },
      map,
    );
    expect(patch).toEqual({ offForm: "I", pos1: 7, randomField: "x" });
  });

  it("only emits canonical pos* keys for personnel — never aliases", () => {
    const { patch } = normalizePatchKeysToCanonical({ QB: 7, F: 22, H: 11 }, {
      pos1: "QB",
      pos2: "H",
      pos3: "F",
    });
    for (const key of Object.keys(patch)) {
      expect(/^(QB|F|H|RG|LT|LG|C|RT|X|Y|1|2|3|4)$/.test(key)).toBe(false);
    }
    expect(patch).toEqual({ pos1: 7, pos3: 22, pos2: 11 });
  });
});

describe("configStore: positionAliases diff", () => {
  const base: SeasonConfig = {
    ...buildDefaultConfig("s1", ["offForm"]),
    updatedAt: "2025-01-01",
  };

  it("detects alias add", () => {
    const after: SeasonConfig = { ...base, positionAliases: { pos1: "QB" } };
    const changes = diffConfig(base, after);
    expect(changes).toEqual([
      { key: "positionAliases.pos1", before: null, after: "QB" },
    ]);
  });

  it("detects alias remove", () => {
    const before: SeasonConfig = { ...base, positionAliases: { pos1: "QB" } };
    const after: SeasonConfig = { ...base, positionAliases: {} };
    const changes = diffConfig(before, after);
    expect(changes).toEqual([
      { key: "positionAliases.pos1", before: "QB", after: null },
    ]);
  });

  it("detects alias change", () => {
    const before: SeasonConfig = { ...base, positionAliases: { pos1: "QB" } };
    const after: SeasonConfig = { ...base, positionAliases: { pos1: "Quarterback" } };
    const changes = diffConfig(before, after);
    expect(changes).toEqual([
      { key: "positionAliases.pos1", before: "QB", after: "Quarterback" },
    ]);
  });

  it("returns empty for identical alias maps", () => {
    const before: SeasonConfig = { ...base, positionAliases: { pos1: "QB" } };
    const after: SeasonConfig = { ...base, positionAliases: { pos1: "QB" } };
    expect(diffConfig(before, after)).toEqual([]);
  });
});
