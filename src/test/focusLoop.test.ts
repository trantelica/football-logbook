import { describe, it, expect } from "vitest";
import { loopTarget } from "@/engine/focusLoop";

describe("focus loop", () => {
  const items = ["first", "mid", "qb"];
  it("Tab on the last box wraps to the first", () => {
    expect(loopTarget(items, "qb", false)).toBe("first");
  });
  it("Shift+Tab on the first box wraps to the last", () => {
    expect(loopTarget(items, "first", true)).toBe("qb");
  });
  it("leaves normal Tab movement to the browser", () => {
    expect(loopTarget(items, "mid", false)).toBeNull();
  });
  it("ignores focus outside the area", () => {
    expect(loopTarget(items, "address-bar", false)).toBeNull();
  });
});
