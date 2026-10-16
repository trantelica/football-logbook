import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePushToTalk } from "@/engine/passShortcuts";

function key(type: "keydown" | "keyup", init: KeyboardEventInit = {}, target: EventTarget = window) {
  const e = new KeyboardEvent(type, { key: " ", bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

describe("usePushToTalk", () => {
  it("starts on Space down and stops on Space up", () => {
    const onStart = vi.fn(); const onStop = vi.fn();
    renderHook(() => usePushToTalk({ enabled: true, onStart, onStop }));
    key("keydown"); key("keydown", { repeat: true }); key("keyup");
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });
  it("ignores text inputs and modifiers", () => {
    const onStart = vi.fn(); const onStop = vi.fn();
    renderHook(() => usePushToTalk({ enabled: true, onStart, onStop }));
    const input = document.createElement("input"); document.body.appendChild(input);
    key("keydown", {}, input); key("keyup", {}, input);
    key("keydown", { ctrlKey: true }); key("keyup");
    expect(onStart).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });
  it("does not stop when start is declined", () => {
    const onStop = vi.fn();
    renderHook(() => usePushToTalk({ enabled: true, onStart: () => false, onStop }));
    key("keydown"); key("keyup");
    expect(onStop).not.toHaveBeenCalled();
  });
});
