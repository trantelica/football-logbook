/**
 * focusLoop — keeps Tab / Shift+Tab inside the work area so focus never
 * escapes to the browser address bar. Tab on the last focusable control
 * wraps to the first; Shift+Tab on the first wraps to the last.
 * Dialogs and popovers render in portals outside the container and trap
 * focus themselves, so they are left alone.
 */
import { useEffect, type RefObject } from "react";

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Pure wrap rule: returns the element to focus, or null to let the browser handle Tab. */
export function loopTarget<T>(items: T[], active: T | null, shift: boolean): T | null {
  if (items.length === 0) return null;
  const first = items[0];
  const last = items[items.length - 1];
  const idx = active == null ? -1 : items.indexOf(active);
  if (idx === -1) return null;
  if (!shift && active === last) return first;
  if (shift && active === first) return last;
  return null;
}

function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => {
    if (el.tabIndex < 0) return false;
    if (el.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    return el.getClientRects().length > 0;
  });
}

export function useFocusLoop(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) return;
      const target = loopTarget(tabbables(root), active, e.shiftKey);
      if (target) {
        e.preventDefault();
        target.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [ref]);
}
