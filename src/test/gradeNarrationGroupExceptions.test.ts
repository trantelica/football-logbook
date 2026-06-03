/**
 * Pass 3 grade narration — group expansion with exception clauses.
 * Deterministic; no AI.
 */
import { describe, it, expect } from "vitest";
import { parseGradeNarration } from "@/engine/gradeNarrationParser";

describe("parseGradeNarration — group + exception clauses", () => {
  it("offensive line should get a one except for the right guard who should get a -2", () => {
    const r = parseGradeNarration(
      "All of the offensive line should get a one except for the right guard who should get a -2",
    );
    expect(r.patch).toEqual({
      gradeLT: 1,
      gradeLG: 1,
      gradeC: 1,
      gradeRG: -2,
      gradeRT: 1,
    });
  });

  it("offensive line gets a one except RG gets minus two", () => {
    const r = parseGradeNarration("offensive line gets a one except RG gets minus two");
    expect(r.patch).toEqual({
      gradeLT: 1,
      gradeLG: 1,
      gradeC: 1,
      gradeRG: -2,
      gradeRT: 1,
    });
  });

  it("O line gets a 1 except for right guard gets negative 2", () => {
    const r = parseGradeNarration("O line gets a 1 except for right guard gets negative 2");
    expect(r.patch).toEqual({
      gradeLT: 1,
      gradeLG: 1,
      gradeC: 1,
      gradeRG: -2,
      gradeRT: 1,
    });
  });

  it("non-exception duplicate assignment still triggers conflict behavior", () => {
    // No "except" — RG appears twice with different values; conflict policy
    // must still exclude RG from the patch.
    const r = parseGradeNarration("O line each gets a one right guard gets a three");
    expect(r.patch.gradeRG).toBeUndefined();
    expect(r.patch).toMatchObject({
      gradeLT: 1, gradeLG: 1, gradeC: 1, gradeRT: 1,
    });
  });
});
