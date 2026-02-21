

# Phase 3 UI Wiring — Implementation (3 Files Only)

## Deviation Record
DB v2 to v3 upgrade is approved and already present in the repo. No further DB/schema changes in this implementation.

## Scope
Three files modified. No engine, schema, or DB changes. No new files created.

---

## 1. GameBar.tsx

**Add** `startGameOpen` state and import `StartGameDialog`.

**Keep** `newGameOpen` state and `NewGameDialog` import (legacy path preserved).

**Replace button layout** inside the `activeSeason` block (lines 119-127):
- Primary button: "Start Game" with a play/flag icon, `variant="default"`, opens `StartGameDialog`
- Secondary button: "Legacy New Game" with `variant="ghost"`, smaller text, opens `NewGameDialog`

**Render** both `<StartGameDialog>` and `<NewGameDialog>` at the bottom of the component.

No other changes to GameBar.

---

## 2. Index.tsx

**Import** `SlotsGrid` from `@/components/SlotsGrid`.

**Insert** `<SlotsGrid />` between `<DraftPanel />` and `<LookupPanel />` in the main content area.

The component self-gates (returns null when no active game or no committed plays), so no conditional wrapper needed.

---

## 3. DraftPanel.tsx

**Import** additional values from `useTransaction()`:
- `selectedSlotNum`, `deselectSlot`, `scaffoldedWarning`, `dismissScaffoldWarning`, `isSlotMode`, `slotMetaMap`

**Import** `Lock`, `X` icons from lucide-react. Import `Badge` from ui/badge. Import `Tooltip` components.

**Add three behavior branches** before the existing form rendering:

### Branch A: Slot mode, no slot selected
When `isSlotMode && selectedSlotNum === null`, render a centered message:
> "Select a slot from the grid below to begin editing."

Return early (do not render the form).

### Branch B: Slot mode, slot selected
Modifications to existing form:

1. **Header**: Change title to `"Draft Entry — Slot #X"` with a Lock icon. Add a "Deselect Slot" ghost button next to "Clear Draft".

2. **playNum field**: Skip rendering the normal input for `playNum`. Instead, render a read-only display:
   - A `Badge` showing `"Play #X"` with a Lock icon and a tooltip reading "Slot-owned — immutable"

3. **Scaffolded warning banner**: When `scaffoldedWarning` is non-null, render an amber banner:
   > "Changing this value may create inconsistency with seeded structure. Downstream plays are not changed automatically."
   
   With an X dismiss button that calls `dismissScaffoldWarning()`.

4. **Committed-field indicators**: For each field label, check if `slotMetaMap.get(selectedSlotNum)?.committedFields` includes the field name. If so, render a small blue dot (neutral color per constraint) with a tooltip reading "Committed".

### Branch C: Legacy mode (non-slot)
No changes to existing behavior. The current form renders exactly as before.

**Technical detail for committed-field indicator**:
- A 6px blue circle (`bg-blue-500`) rendered inline before the label text
- Wrapped in a Tooltip with content "Committed"
- Only shown when the field is in the committed fields list
- Blue chosen as neutral color (not green) per user constraint

---

## Files NOT Changed
- All `src/engine/*` files
- `src/components/StartGameDialog.tsx`
- `src/components/SlotsGrid.tsx`
- `src/components/NewGameDialog.tsx`
- All other files

## Test Walkthrough (Post-Implementation)
1. Create season, click "Start Game", fill wizard, confirm -- slots grid appears with seeded QTR/ODK/SERIES
2. Click a slot row -- DraftPanel updates to show "Slot #X", playNum locked, deselect button visible
3. Fill an empty field (e.g. offForm) and commit -- no overwrite prompt
4. Edit a committed field to a different value and commit -- overwrite confirmation dialog appears, audit event written
5. Edit a scaffolded field (odk, qtr, series) on a committed slot -- amber warning banner appears with explicit text about downstream plays not being changed automatically

