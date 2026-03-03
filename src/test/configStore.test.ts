import { describe, it, expect } from "vitest";
import { buildDefaultConfig, diffConfig, type SeasonConfig } from "../engine/configStore";

describe("buildDefaultConfig", () => {
  it("returns version=1, fieldSize=80, all keys true", () => {
    const cfg = buildDefaultConfig("s1", ["offForm", "offPlay", "motion"]);
    expect(cfg.version).toBe(1);
    expect(cfg.fieldSize).toBe(80);
    expect(cfg.seasonId).toBe("s1");
    expect(cfg.updatedBy).toBe("local");
    expect(cfg.activeFields).toEqual({ offForm: true, offPlay: true, motion: true });
  });
});

describe("diffConfig", () => {
  const base: SeasonConfig = {
    seasonId: "s1",
    version: 1,
    updatedAt: "2025-01-01",
    updatedBy: "local",
    fieldSize: 80,
    activeFields: { offForm: true, offPlay: true, motion: true },
  };

  it("detects changed fieldSize", () => {
    const after = { ...base, fieldSize: 100 as 80 | 100 };
    const changes = diffConfig(base, after);
    expect(changes).toEqual([{ key: "fieldSize", before: 80, after: 100 }]);
  });

  it("detects changed nested activeFields.offForm", () => {
    const after = { ...base, activeFields: { ...base.activeFields, offForm: false } };
    const changes = diffConfig(base, after);
    expect(changes).toEqual([{ key: "activeFields.offForm", before: true, after: false }]);
  });

  it("returns empty for identical configs", () => {
    const changes = diffConfig(base, { ...base });
    expect(changes).toEqual([]);
  });
});
