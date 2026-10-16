import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import {
  useCommitShortcuts,
  usePassShortcuts,
  usePushToTalk,
  matchCommitChord,
  COMMIT_ACTIONS,
} from "@/engine/passShortcuts";

function Harness(props: {
  onNext?: () => void;
  onStay?: () => void;
  onExit?: () => void;
  onEscape?: () => void;
  lettersSuspended?: () => boolean;
  suspended?: () => boolean;
  onStart?: () => void;
}) {
  useCommitShortcuts({
    enabled: true,
    suspended: props.suspended,
    lettersSuspended: props.lettersSuspended,
    onNext: props.onNext ?? (() => {}),
    onStay: props.onStay ?? (() => {}),
    onExit: props.onExit ?? (() => {}),
  });
  usePassShortcuts({ enabled: true, bindings: {}, onEscape: props.onEscape });
  usePushToTalk({ enabled: true, onStart: props.onStart ?? (() => {}), onStop: () => {} });
  return <input data-testid="field" />;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("matchCommitChord", () => {
  const base = { key: "Enter", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
  it("maps the documented chords", () => {
    expect(matchCommitChord({ ...base, ctrlKey: true })).toBe("next");
    expect(matchCommitChord({ ...base, metaKey: true })).toBe("next");
    expect(matchCommitChord({ ...base, metaKey: true, shiftKey: true })).toBe("stay");
    expect(matchCommitChord({ ...base, ctrlKey: true, altKey: true })).toBe("exit");
    expect(matchCommitChord({ ...base, metaKey: true, altKey: true })).toBe("exit");
    expect(matchCommitChord({ ...base, key: ".", metaKey: true })).toBe("exit");
    expect(matchCommitChord({ ...base, key: "." })).toBeNull();
  });
  it("never matches plain Enter or plain Escape", () => {
    expect(matchCommitChord(base)).toBeNull();
    expect(matchCommitChord({ ...base, key: "Escape" })).toBeNull();
    expect(matchCommitChord({ ...base, key: "Escape", ctrlKey: true })).toBeNull();
  });
  it("exposes one letter per action, none colliding with Space", () => {
    expect(COMMIT_ACTIONS.map((a) => a.letter)).toEqual(["N", "Y", "L"]);
  });
});

describe("useCommitShortcuts", () => {
  it("fires letters N / Y / L", () => {
    const onNext = vi.fn(), onStay = vi.fn(), onExit = vi.fn();
    render(<Harness onNext={onNext} onStay={onStay} onExit={onExit} />);
    fireEvent.keyDown(window, { key: "n" });
    fireEvent.keyDown(window, { key: "y" });
    fireEvent.keyDown(window, { key: "L" });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("blocks letters inside a text input but allows chords", () => {
    const onNext = vi.fn(), onStay = vi.fn(), onExit = vi.fn();
    const { getByTestId } = render(<Harness onNext={onNext} onStay={onStay} onExit={onExit} />);
    const field = getByTestId("field");
    field.focus();
    fireEvent.keyDown(field, { key: "n" });
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(field, { key: "Enter", metaKey: true, shiftKey: true });
    fireEvent.keyDown(field, { key: "Enter", metaKey: true, altKey: true });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("blocks letters and chords while a dialog is open", () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    const dlg = document.createElement("div");
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("data-state", "open");
    document.body.appendChild(dlg);
    fireEvent.keyDown(window, { key: "n" });
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("lettersSuspended blocks letters only (Text Editing)", () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} lettersSuspended={() => true} />);
    fireEvent.keyDown(window, { key: "n" });
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("ignores auto-repeat on chords", () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true, repeat: true });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("Cmd+Option+Enter exits; plain Esc runs its handler and never commits", () => {
    const onEscape = vi.fn(), onExit = vi.fn();
    render(<Harness onEscape={onEscape} onExit={onExit} />);
    fireEvent.keyDown(window, { key: ".", metaKey: true });
    expect(onExit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("does not collide with push-to-talk (Space triggers no commit)", () => {
    const onNext = vi.fn(), onStay = vi.fn(), onExit = vi.fn(), onStart = vi.fn();
    render(<Harness onNext={onNext} onStay={onStay} onExit={onExit} onStart={onStart} />);
    fireEvent.keyDown(window, { key: " " });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
    expect(onStay).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });
});
