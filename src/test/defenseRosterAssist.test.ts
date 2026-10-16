import { describe, it, expect } from "vitest";
import { collectDefenseRosterAssist, validateDefenseRules } from "@/engine/defenseRosterAssist";
const roster = [
  { jerseyNumber: 32, playerName: "Tyler Reed" },
  { jerseyNumber: 5, playerName: "Sam Fisher" },
  { jerseyNumber: 21, playerName: "Jake Price" },
];
const run = (text: string, blocked: string[] = []) =>
  collectDefenseRosterAssist({ text, roster, blockedFields: new Set(blocked) }).map((o) => `${o.field}=${o.jerseyNumber}`);

describe("defense roster assist", () => {
  it("fills tacklers in spoken order", () => {
    expect(run("tackle by Reed and Fisher")).toEqual(["tackler1=32", "tackler2=5"]);
  });
  it("accepts jersey numbers and skips filled slots", () => {
    expect(run("tackled by 21", ["tackler1"])).toEqual(["tackler2=21"]);
  });
  it("routes interception and awards", () => {
    expect(run("intercepted by Price, dawg award goes to Fisher")).toEqual(["interceptedBy=21", "dawg=5"]);
  });
  it("needs a cue", () => {
    expect(run("Reed lined up wide")).toEqual([]);
  });
});

describe("defense rules", () => {
  it("requires Intercepted By on interceptions", () => {
    expect(validateDefenseRules({ odk: "D", result: "Interception" }).interceptedBy).toBeTruthy();
    expect(validateDefenseRules({ odk: "D", result: "Interception", interceptedBy: 21 })).toEqual({});
  });
  it("ignores offense", () => {
    expect(validateDefenseRules({ odk: "O", result: "Interception" })).toEqual({});
  });
  it("flags tackler gaps and duplicates", () => {
    expect(validateDefenseRules({ odk: "D", tackler2: 5 }).tackler2).toBeTruthy();
    expect(validateDefenseRules({ odk: "D", tackler1: 5, tackler2: 5 }).tackler2).toBeTruthy();
  });
});
