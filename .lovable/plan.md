# Keep Tab inside the work area (starting with Pass 2 Personnel)

## Problem
In Pass 2, pressing Tab from the QB jersey box jumps out of the app to the browser address bar. Tab should stay inside the current entry area.

## What changes
- Pass 2 Personnel: Tab moves through the 11 position boxes in their on-screen order. Tab from the last box (QB) wraps to the first box; Shift+Tab from the first wraps to the last.
- The commit buttons stay reachable: the loop is position boxes, then the commit action row, then back to the first box.
- Same rule applied to the other entry areas so it feels the same everywhere: Pass 1 / Pass 4 cards, Pass 3 grades.
- Dropdowns, dialogs and the dictation box keep working as they do now. Esc and the existing shortcuts (N / Y / L, T, Hold Space) are unchanged.
- Captured in roadmap.md as the first item of a new "Coach usability enhancements" list, so further items you send can be added there.

## Technical details
- Add a small shared `useFocusLoop(containerRef)` hook: on Tab / Shift+Tab at the first or last tabbable element inside the container, `preventDefault` and move focus to the other end. Skips when a dialog or popover (ActorCombobox list, Select) is open.
- Wrap the PersonnelPanel entry grid + action row in the loop container; tab order follows SLOT_GROUPS spatial order (no reordering of SLOT_GROUPS).
- Apply the same hook to Pass1SectionPanel and the Pass 3 grade panel.
- Hook lives above any early returns (avoid the earlier hooks-order error).
- Tests: unit test for the wrap logic (last → first, first → last on Shift+Tab, no-op when a popover is open). Playwright check in Pass 2: focus QB, press Tab, confirm focus is still inside the panel.
