import { describe, it, expect } from "vitest";
import { HUDL_HEADERS, toHudlCsv } from "@/engine/hudlExport";
import { getFieldDef, getFieldsForPass } from "@/engine/schema";
import type { PlayRecord } from "@/engine/types";

const DEF_LABELS = [
  "DEF FRONT", "DEF STR", "BLITZ", "COVERAGE", "RET YARDS",
  "TACKLER1", "TACKLER2", "TACKLER3", "TACKLER4",
  "INTERCEPTED BY", "COVER PLAYER", "PBR", "DAWG", "UNSUNG",
];

describe("Pass 4 defense contract", () => {
  it("appends defensive headers after 4 GRADE without changing earlier order", () => {
    const labels = HUDL_HEADERS.map((h) => h.label);
    const g = labels.indexOf("4 GRADE");
    expect(g).toBe(47);
    expect(labels.slice(g + 1)).toEqual(DEF_LABELS);
  });

  it("defensive fields are pass 4 only", () => {
    expect(getFieldDef("defFront")?.defaultPassEntry).toBe(4);
    expect(getFieldDef("defFront")?.lookupMode).toBe("season");
    expect(getFieldsForPass(3).some((f) => f.name === "tackler1")).toBe(false);
  });

  it("old records without defensive fields export blank cells", () => {
    const csv = toHudlCsv([{ gameId: "g", playNum: 1, odk: "O" } as unknown as PlayRecord]);
    const row = csv.split("\n")[1].split(",");
    expect(row.slice(-DEF_LABELS.length).every((c) => c === "")).toBe(true);
  });
});
