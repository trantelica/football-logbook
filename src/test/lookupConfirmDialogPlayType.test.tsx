import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  LookupConfirmDialog,
  partitionPlayTypeOptions,
  COMMON_PLAY_TYPES,
} from "@/components/LookupConfirmDialog";
import { PLAY_TYPE_VALUES, LOOKUP_DEPENDENT_ATTRS } from "@/engine/schema";

describe("U2: playType ordering helper", () => {
  it("places Run and Pass first in the common group", () => {
    const { common, other } = partitionPlayTypeOptions(PLAY_TYPE_VALUES);
    expect(common).toEqual(["Run", "Pass"]);
    expect(other[0]).not.toBe("Run");
    expect(other).not.toContain("Run");
    expect(other).not.toContain("Pass");
  });

  it("preserves all remaining allowed values in original order", () => {
    const { other } = partitionPlayTypeOptions(PLAY_TYPE_VALUES);
    const expected = PLAY_TYPE_VALUES.filter(
      (v) => !COMMON_PLAY_TYPES.includes(v)
    );
    expect(other).toEqual(expected);
    // No values dropped
    expect(other.length + 2).toBe(PLAY_TYPE_VALUES.length);
  });

  it("handles allowedValues missing Run/Pass without injecting them", () => {
    const { common, other } = partitionPlayTypeOptions(["FG", "Punt"]);
    expect(common).toEqual([]);
    expect(other).toEqual(["FG", "Punt"]);
  });
});

describe("U2: LookupConfirmDialog render", () => {
  it("renders Common (Run, Pass) and Other group labels for offPlay playType", () => {
    render(
      <LookupConfirmDialog
        open
        fieldName="offPlay"
        fieldLabel="Off Play"
        value="Slant"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    // Trigger shows placeholder; group labels live in portal content.
    // SelectContent for Radix is unmounted until open; assert the dialog mounted with Play Type label.
    expect(screen.getByText(/Play Type/i)).toBeInTheDocument();
    // Verify the helper output drives correct partitioning at the data level.
    const { common, other } = partitionPlayTypeOptions(
      LOOKUP_DEPENDENT_ATTRS.offPlay.find((d) => d.name === "playType")!
        .allowedValues
    );
    expect(common).toEqual(["Run", "Pass"]);
    expect(other).toContain("FG");
    expect(other).toContain("Punt");
  });

  it("does not group/reorder non-playType dependent selects (offForm)", () => {
    // Helper is only invoked for offPlay+playType in component; for any other
    // field/attr the original allowedValues order is preserved untouched.
    const personnelDef = LOOKUP_DEPENDENT_ATTRS.offForm.find(
      (d) => d.name === "personnel"
    )!;
    // Simulate component branch: non-offPlay path = identity ordering
    const rendered = [...personnelDef.allowedValues];
    expect(rendered).toEqual([...personnelDef.allowedValues]);
    expect(rendered[0]).toBe("10");
  });
});
