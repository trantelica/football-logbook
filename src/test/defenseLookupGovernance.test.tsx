import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { buildLookupGovernanceQueue, GOVERNED_LOOKUP_FIELD_NAMES } from "@/engine/lookupGovernanceQueue";
import { LookupConfirmDialog } from "@/components/LookupConfirmDialog";

describe("coach-maintained defensive lists", () => {
  it("includes all defensive vocabularies but excludes enums and roster actors", () => {
    expect(GOVERNED_LOOKUP_FIELD_NAMES).toEqual([
      "offForm", "offPlay", "motion", "defFront", "blitz", "coverage",
    ]);
    expect(buildLookupGovernanceQueue({ result: "New result", defStrength: "New strength", tackler1: 99 }, new Map())).toEqual([]);
  });

  it("queues unknown defensive values for reviewed additions, even with empty lists", () => {
    expect(buildLookupGovernanceQueue({ defFront: "bear", blitz: "storm", coverage: "cloud" }, new Map())).toEqual([
      { fieldName: "defFront", fieldLabel: "Def Front", value: "Bear", source: "manual" },
      { fieldName: "blitz", fieldLabel: "Blitz", value: "Storm", source: "manual" },
      { fieldName: "coverage", fieldLabel: "Coverage", value: "Cloud", source: "manual" },
    ]);
  });

  it("accepts existing canonical values case-insensitively and leaves inputs unchanged", () => {
    const candidate = { defFront: "bear", coverage: "cloud" };
    const lookups = new Map([["defFront", ["Bear"]], ["coverage", ["Cloud"]]]);
    expect(buildLookupGovernanceQueue(candidate, lookups)).toEqual([]);
    expect(candidate).toEqual({ defFront: "bear", coverage: "cloud" });
  });

  it("preserves AI review provenance and offensive queue order", () => {
    const queue = buildLookupGovernanceQueue({ coverage: "cloud", offPlay: "26 punch" }, new Map(), new Set(["coverage"]));
    expect(queue.map((item) => item.fieldName)).toEqual(["offPlay", "coverage"]);
    expect(queue[1].source).toBe("ai");
  });

  it.each(["defFront", "blitz", "coverage"])("requires explicit confirmation to add %s without dependent enums", (fieldName) => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    const { unmount } = render(<LookupConfirmDialog open fieldName={fieldName} fieldLabel={fieldName} value="New call" onConfirm={confirm} onCancel={cancel} />);
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Value" }));
    expect(confirm).toHaveBeenCalledWith(undefined);
    unmount();
  });
});