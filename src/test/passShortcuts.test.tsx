import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import {
  usePassShortcuts,
  isTextInputTarget,
  anyRadixDialogOpen,
} from "@/engine/passShortcuts";

function Harness(props: {
  enabled?: boolean;
  suspended?: () => boolean;
  onU?: () => void;
  onEscape?: () => void;
}) {
  usePassShortcuts({
    enabled: props.enabled ?? true,
    suspended: props.suspended,
    bindings: { U: props.onU },
    onEscape: props.onEscape,
  });
  return (
    <div>
      <input data-testid="field" />
      <button data-testid="btn">btn</button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("usePassShortcuts", () => {
  it("fires a bound key", () => {
    const onU = vi.fn();
    render(<Harness onU={onU} />);
    fireEvent.keyDown(window, { key: "u" });
    expect(onU).toHaveBeenCalledTimes(1);
  });

  it("ignores keys with modifiers", () => {
    const onU = vi.fn();
    render(<Harness onU={onU} />);
    fireEvent.keyDown(window, { key: "u", metaKey: true });
    fireEvent.keyDown(window, { key: "u", ctrlKey: true });
    fireEvent.keyDown(window, { key: "u", altKey: true });
    expect(onU).not.toHaveBeenCalled();
  });

  it("does not fire while focus is in a text input", () => {
    const onU = vi.fn();
    const { getByTestId } = render(<Harness onU={onU} />);
    const field = getByTestId("field") as HTMLInputElement;
    field.focus();
    fireEvent.keyDown(field, { key: "u" });
    expect(onU).not.toHaveBeenCalled();
  });

  it("does not fire while a dialog is open", () => {
    const onU = vi.fn();
    render(<Harness onU={onU} />);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-state", "open");
    document.body.appendChild(dialog);
    fireEvent.keyDown(window, { key: "u" });
    expect(onU).not.toHaveBeenCalled();
    dialog.remove();
    fireEvent.keyDown(window, { key: "u" });
    expect(onU).toHaveBeenCalledTimes(1);
  });

  it("respects the suspended predicate", () => {
    const onU = vi.fn();
    render(<Harness onU={onU} suspended={() => true} />);
    fireEvent.keyDown(window, { key: "u" });
    expect(onU).not.toHaveBeenCalled();
  });

  it("registers nothing when disabled", () => {
    const onU = vi.fn();
    render(<Harness onU={onU} enabled={false} />);
    fireEvent.keyDown(window, { key: "u" });
    expect(onU).not.toHaveBeenCalled();
  });

  it("ignores unbound keys", () => {
    const onU = vi.fn();
    render(<Harness onU={onU} />);
    fireEvent.keyDown(window, { key: "z" });
    expect(onU).not.toHaveBeenCalled();
  });

  it("runs the escape handler even from a text input", () => {
    const onEscape = vi.fn();
    const { getByTestId } = render(<Harness onEscape={onEscape} />);
    fireEvent.keyDown(getByTestId("field"), { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});

describe("guard helpers", () => {
  it("detects text input targets", () => {
    const input = document.createElement("input");
    const div = document.createElement("div");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    document.body.append(input, div, editable);
    expect(isTextInputTarget(input)).toBe(true);
    expect(isTextInputTarget(document.createElement("textarea"))).toBe(true);
    expect(isTextInputTarget(document.createElement("select"))).toBe(true);
    expect(isTextInputTarget(div)).toBe(false);
    expect(isTextInputTarget(null)).toBe(false);
  });

  it("detects open dialogs and alert dialogs", () => {
    expect(anyRadixDialogOpen()).toBe(false);
    const alert = document.createElement("div");
    alert.setAttribute("role", "alertdialog");
    alert.setAttribute("data-state", "open");
    document.body.appendChild(alert);
    expect(anyRadixDialogOpen()).toBe(true);
    alert.setAttribute("data-state", "closed");
    expect(anyRadixDialogOpen()).toBe(false);
  });
});
