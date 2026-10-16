/**
 * passShortcuts — one shared implementation of the single-key workflow
 * shortcut rules, so Pass 1, Pass 2, and Pass 3 cannot drift apart.
 *
 * The guard rules are lifted verbatim from the original Pass 1 handler:
 *  - no modifiers (Cmd/Ctrl/Alt bail out)
 *  - single printable keys only
 *  - never steal keystrokes while focus is in a text input / textarea /
 *    select / contenteditable
 *  - never fire while ANY Radix Dialog or AlertDialog is open (detected
 *    generically in the DOM rather than enumerating dialog components)
 *  - a `suspended` flag lets a pass turn its own bindings off (Pass 1 Text
 *    Editing mode, a pass whose slot is not selected, etc.)
 *
 * A key with no binding does nothing at all — it is not swallowed.
 */

import { useEffect, useRef } from "react";

export function isTextInputTarget(t: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}

/** True when any Radix Dialog / AlertDialog primitive is currently open. */
export function anyRadixDialogOpen(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
}

export type ShortcutBindings = Record<string, (() => void) | undefined>;

export interface UsePassShortcutsOptions {
  /** Master switch — false removes the listener entirely. */
  enabled: boolean;
  /**
   * Extra suspension predicate evaluated per keystroke (scoped modals the DOM
   * probe cannot see, in-flight work, etc.).
   */
  suspended?: () => boolean;
  /** Uppercase single-character key -> handler. */
  bindings: ShortcutBindings;
  /** Escape handler. Runs even when focus is in a text input. */
  onEscape?: () => void;
}

/**
 * Register single-key workflow shortcuts for a pass.
 *
 * Bindings are read through a ref, so callers may pass freshly created
 * closures each render without re-subscribing the listener.
 */
export function usePassShortcuts({
  enabled,
  suspended,
  bindings,
  onEscape,
}: UsePassShortcutsOptions): void {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const esc = escapeRef.current;
        if (esc) {
          esc();
          e.preventDefault();
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (suspendedRef.current?.()) return;
      if (anyRadixDialogOpen()) return;
      if (isTextInputTarget(e.target)) return;
      if (e.key.length !== 1) return;

      const handler = bindingsRef.current[e.key.toUpperCase()];
      if (!handler) return;
      e.preventDefault();
      handler();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** Composite widgets where Space has its own meaning (open, toggle, select). */
function isSpaceOwnedWidget(t: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(t instanceof HTMLElement)) return false;
  return !!t.closest(
    '[role="combobox"],[role="listbox"],[role="option"],[role="menu"],[role="menuitem"],' +
      '[role="tab"],[role="switch"],[role="checkbox"],[role="radio"],[role="slider"],a[href]',
  );
}

export interface UsePushToTalkOptions {
  enabled: boolean;
  /** Per-keystroke suspension (Text Editing, scoped modals, in-flight work). */
  suspended?: () => boolean;
  /** Hold started. Return false to decline (e.g. mic already live). */
  onStart: () => boolean | void;
  /** Hold released (also fires on window blur). Only called after an accepted start. */
  onStop: () => void;
}

/**
 * Hold SPACE to talk, release to stop. Same guards as usePassShortcuts
 * (no modifiers, never in a text field, never while a dialog is open).
 * Capture only: releasing the key stops the mic and never updates the
 * proposal or commits anything.
 */
export function usePushToTalk({ enabled, suspended, onStart, onStop }: UsePushToTalkOptions): void {
  const startRef = useRef(onStart);
  startRef.current = onStart;
  const stopRef = useRef(onStop);
  stopRef.current = onStop;
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;

  useEffect(() => {
    if (!enabled) return;
    let holding = false;

    function release() {
      if (!holding) return;
      holding = false;
      stopRef.current();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== " ") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (holding) {
        // Swallow auto-repeat so the page never scrolls mid-hold.
        e.preventDefault();
        return;
      }
      if (e.repeat) return;
      if (suspendedRef.current?.()) return;
      if (anyRadixDialogOpen()) return;
      if (isTextInputTarget(e.target) || isSpaceOwnedWidget(e.target)) return;
      const accepted = startRef.current();
      if (accepted === false) return;
      holding = true;
      e.preventDefault();
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key !== " " || !holding) return;
      // Also cancels the click a focused button would otherwise fire on Space-up.
      e.preventDefault();
      release();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      release();
    };
  }, [enabled]);
}
