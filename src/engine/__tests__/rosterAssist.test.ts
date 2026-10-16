import { describe, it, expect } from "vitest";
import { collectRosterAssist } from "../rosterAssist";

const roster = [
  { jerseyNumber: 12, playerName: "Tyler Johnson" },
  { jerseyNumber: 4, playerName: "Marcus Reed" },
];

describe("collectRosterAssist", () => {
  it("maps names to roles via cue words", () => {
    const r = collectRosterAssist({ text: "pass from Johnson caught by Reed for 12", roster });
    expect(r.find((o) => o.field === "passer")?.jerseyNumber).toBe(12);
    expect(r.find((o) => o.field === "receiver")?.jerseyNumber).toBe(4);
  });
  it("matches near-miss STT spellings", () => {
    const r = collectRosterAssist({ text: "carried by Jonson", roster });
    expect(r[0]).toMatchObject({ field: "rusher", jerseyNumber: 12, signal: "stt_edit" });
  });
  it("skips names without a cue and blocked fields", () => {
    expect(collectRosterAssist({ text: "Johnson", roster })).toEqual([]);
    expect(collectRosterAssist({ text: "run by Reed", roster, blockedFields: new Set(["rusher"]) })).toEqual([]);
  });
});
