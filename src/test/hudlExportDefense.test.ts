import { describe, it, expect } from "vitest";
import { createSlots } from "@/engine/slotEngine";
import { HUDL_HEADERS, toHudlCsv } from "@/engine/hudlExport";
import { DEFENSE_LEDGER_COLUMNS } from "@/components/PlayLedger";
import type { PlayRecord } from "@/engine/types";

function col(label: string): number {
  const i = HUDL_HEADERS.findIndex((h) => h.label === label);
  if (i < 0) throw new Error(`no column ${label}`);
  return i;
}

describe("Hudl export of a defensive play", () => {
  const plays = createSlots("g1", 2, { "1": 1 }, [
    { odk: "O", startPlay: 1, endPlay: 1 },
    { odk: "D", startPlay: 2, endPlay: 2 },
  ]).slots;
  plays[1] = {
    ...plays[1],
    odk: "D", dn: "1", dist: 10, yardLn: -25,
    result: "Pass Int", gainLoss: 0,
    defFront: "Bear", defStrength: "L", blitz: "Fire Zone", coverage: "Cover 3",
    retYards: 12, tackler1: 44, tackler2: 9, interceptedBy: 21, dawg: 44,
  } as PlayRecord;
  const row = toHudlCsv(plays).split("\n").find((l) => l.startsWith("2,"))!.split(",");

  it("writes defensive calls and playmakers into their Hudl columns", () => {
    expect(row[col("ODK")]).toBe("D");
    expect(row[col("YARD LN")]).toBe("-25");
    expect(row[col("DEF FRONT")]).toBe("Bear");
    expect(row[col("COVERAGE")]).toBe("Cover 3");
    expect(row[col("BLITZ")]).toBe("Fire Zone");
    expect(row[col("RET YARDS")]).toBe("12");
    expect(row[col("TACKLER1")]).toBe("44");
    expect(row[col("TACKLER2")]).toBe("9");
    expect(row[col("INTERCEPTED BY")]).toBe("21");
    expect(row[col("DAWG")]).toBe("44");
  });

  it("leaves defensive columns blank on the offensive row", () => {
    const o = toHudlCsv(plays).split("\n").find((l) => l.startsWith("1,"))!.split(",");
    expect(o[col("DEF FRONT")]).toBe("");
    expect(o[col("TACKLER1")]).toBe("");
  });

  it("ledger defense view only lists exported fields", () => {
    const keys = new Set(HUDL_HEADERS.map((h) => h.key));
    for (const c of DEFENSE_LEDGER_COLUMNS) expect(keys.has(c)).toBe(true);
  });
});
