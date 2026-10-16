import { describe, it, expect } from "vitest";
import { computePrediction } from "@/engine/prediction";
import { computeSeriesForPlay } from "@/engine/slotEngine";
import type { PlayRecord } from "@/engine/types";

const play = (o: Partial<PlayRecord>): PlayRecord =>
  ({ gameId: "g", playNum: 1, qtr: "1", odk: "O", series: 1, yardLn: -30, dn: "4", dist: 8,
     result: "Rush", gainLoss: 3, penalty: null, ...o } as unknown as PlayRecord);

describe("turnover on downs O ↔ D", () => {
  it("4th & 8 on -30, gain 3 → D ball on 33, 1st & 10", () => {
    const r = computePrediction(play({}), "D", 80);
    expect(r).toMatchObject({ eligible: true, yardLn: 33, dn: 1, dist: 10 });
  });

  it("works the other way (D → O)", () => {
    const r = computePrediction(play({ odk: "D", yardLn: -30, gainLoss: 3 }), "O", 80);
    expect(r).toMatchObject({ eligible: true, yardLn: 33, dn: 1 });
  });

  it("short distance to goal caps dist", () => {
    const r = computePrediction(play({ yardLn: 10, gainLoss: 2, dist: 5 }), "D", 80);
    // our ball on their 8 → opponent ball on their own 8 → -8, 1st & 10
    expect(r).toMatchObject({ yardLn: -8, dn: 1, dist: 10 });
  });

  it("does not flip on interception or when 4th down was converted", () => {
    expect(computePrediction(play({ result: "Interception" }), "D", 80).eligible).toBe(false);
    expect(computePrediction(play({ gainLoss: 9 }), "D", 80).eligible).toBe(false);
  });

  it("D → D progresses like offense", () => {
    const r = computePrediction(play({ odk: "D", dn: "1", dist: 10, gainLoss: 4 }), "D", 80);
    expect(r).toMatchObject({ eligible: true, yardLn: -34, dn: 2, dist: 6 });
  });
});

describe("defensive series numbering", () => {
  const blocks = [
    { odk: "O", startPlay: 1, endPlay: 3 },
    { odk: "D", startPlay: 4, endPlay: 6 },
    { odk: "O", startPlay: 7, endPlay: 8 },
    { odk: "D", startPlay: 9, endPlay: 10 },
  ];
  it("D series counts its own drives", () => {
    expect(computeSeriesForPlay(4, blocks)).toBe(1);
    expect(computeSeriesForPlay(9, blocks)).toBe(2);
    expect(computeSeriesForPlay(7, blocks)).toBe(2);
  });
});
