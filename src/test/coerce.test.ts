import { describe, it, expect } from "vitest";
import { coercePlayToSchemaTypes } from "@/engine/coerce";
import type { PlayRecord } from "@/engine/types";

function makePlay(overrides: Partial<Record<string, unknown>> = {}): PlayRecord {
  const base: Record<string, unknown> = {
    gameId: "game-1",
    playNum: 1,
    qtr: null,
    odk: null,
    series: null,
    yardLn: null,
    dn: null,
    dist: null,
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
    posLT: null,
    posLG: null,
    posC: null,
    posRG: null,
    posRT: null,
    posX: null,
    posY: null,
    pos1: null,
    pos2: null,
    pos3: null,
    pos4: null,
    returner: null,
    gradeLT: null,
    gradeLG: null,
    gradeC: null,
    gradeRG: null,
    gradeRT: null,
    gradeX: null,
    gradeY: null,
    grade1: null,
    grade2: null,
    grade3: null,
    grade4: null,
    ...overrides,
  };
  return base as unknown as PlayRecord;
}

describe("coercePlayToSchemaTypes", () => {
  // A) Numeric strings → numbers
  it("converts numeric string qtr to number", () => {
    const play = makePlay({ qtr: "1" });
    const result = coercePlayToSchemaTypes(play);
    expect(result.qtr).toBe(1);
    expect(typeof result.qtr).toBe("number");
  });

  it("converts numeric string dn to number", () => {
    const play = makePlay({ dn: "3" });
    const result = coercePlayToSchemaTypes(play);
    expect(result.dn).toBe(3);
    expect(typeof result.dn).toBe("number");
  });

  it("converts negative string yardLn to number", () => {
    const play = makePlay({ yardLn: "-35" });
    const result = coercePlayToSchemaTypes(play);
    expect(result.yardLn).toBe(-35);
    expect(typeof result.yardLn).toBe("number");
  });

  it("converts numeric string gainLoss to number", () => {
    const play = makePlay({ gainLoss: "10" });
    const result = coercePlayToSchemaTypes(play);
    expect(result.gainLoss).toBe(10);
    expect(typeof result.gainLoss).toBe("number");
  });

  it("converts actor fields from strings to numbers", () => {
    const play = makePlay({ rusher: "22", passer: "12", receiver: "88" });
    const result = coercePlayToSchemaTypes(play);
    expect(result.rusher).toBe(22);
    expect(result.passer).toBe(12);
    expect(result.receiver).toBe(88);
  });

  it("converts position fields from strings to numbers", () => {
    const play = makePlay({ pos1: "55", pos2: "77", pos3: "33", pos4: "11" });
    const result = coercePlayToSchemaTypes(play);
    expect((result as any).pos1).toBe(55);
    expect((result as any).pos2).toBe(77);
    expect((result as any).pos3).toBe(33);
    expect((result as any).pos4).toBe(11);
  });

  it("converts grade fields from strings to numbers", () => {
    const play = makePlay({ gradeLT: "2", gradeC: "-1" });
    const result = coercePlayToSchemaTypes(play);
    expect((result as any).gradeLT).toBe(2);
    expect((result as any).gradeC).toBe(-1);
  });

  // B) Input not mutated
  it("does not mutate the input object", () => {
    const play = makePlay({ qtr: "2", dn: "4", gainLoss: "15" });
    const original = { ...play } as Record<string, unknown>;
    coercePlayToSchemaTypes(play);
    expect((play as any).qtr).toBe("2");
    expect((play as any).dn).toBe("4");
    expect((play as any).gainLoss).toBe("15");
  });

  // C) Non-integer fields unchanged
  it("does not alter enum fields", () => {
    const play = makePlay({ odk: "O", hash: "L", result: "Rush", eff: "Y" });
    const result = coercePlayToSchemaTypes(play);
    expect(result.odk).toBe("O");
    expect(result.hash).toBe("L");
    expect(result.result).toBe("Rush");
    expect(result.eff).toBe("Y");
  });

  it("does not alter string fields", () => {
    const play = makePlay({ offForm: "Shotgun", offPlay: "Sweep" });
    const result = coercePlayToSchemaTypes(play);
    expect(result.offForm).toBe("Shotgun");
    expect(result.offPlay).toBe("Sweep");
  });

  // D) null/undefined → null
  it("converts null to null", () => {
    const play = makePlay({ qtr: null, dn: null });
    const result = coercePlayToSchemaTypes(play);
    expect(result.qtr).toBeNull();
    expect(result.dn).toBeNull();
  });

  it("converts undefined to null", () => {
    const play = makePlay({ dist: undefined });
    const result = coercePlayToSchemaTypes(play);
    expect(result.dist).toBeNull();
  });

  // E) Non-parseable strings → null
  it("sets non-numeric strings to null", () => {
    const play = makePlay({ qtr: "abc", gainLoss: "3.5" });
    const result = coercePlayToSchemaTypes(play);
    expect(result.qtr).toBeNull();
    expect(result.gainLoss).toBeNull();
  });

  // F) Already-number values preserved
  it("keeps numeric values as-is", () => {
    const play = makePlay({ qtr: 3, dn: 2, dist: 10, gainLoss: -5 });
    const result = coercePlayToSchemaTypes(play);
    expect(result.qtr).toBe(3);
    expect(result.dn).toBe(2);
    expect(result.dist).toBe(10);
    expect(result.gainLoss).toBe(-5);
  });

  // G) playNum coercion
  it("coerces string playNum to number", () => {
    const play = makePlay({ playNum: "7" as any });
    const result = coercePlayToSchemaTypes(play);
    expect(result.playNum).toBe(7);
    expect(typeof result.playNum).toBe("number");
  });
});
