

# Phase 4 — Pass 1: Basic Offensive Play Metadata (Final)

## Adjustments Applied
1. **No legacy branching**: `activePass` defaults to `1` unconditionally. No special-casing for legacy/slot-mode.
2. **Strict field locking**: Fields with `defaultPassEntry > activePass` are visible but fully read-only (disabled inputs, not just reduced opacity). They cannot enter candidate state or affect commit.

## Scope
Three files modified. No engine, schema, DB, or validation changes.

---

## 1. transaction.tsx

### Changes

**Line 74**: Replace `const activePass = 0` with `const [activePass, setActivePass] = useState<number>(1)`.

**Add state**: `const [odkFilter, setOdkFilter] = useState<string>("ALL")`.

**Reset effect (lines 78-100)**: Add `setActivePass(1)` and `setOdkFilter("ALL")` to the game-change reset block. No conditional logic -- always resets to `1`.

**Context interface (lines 17-47)**: Add to `TransactionContextValue`:
- `setActivePass: (pass: number) => void`
- `odkFilter: string`
- `setOdkFilter: (filter: string) => void`
- `commitAndNext: () => Promise<{ committed: boolean; hasNext: boolean }>`

**New function `commitAndNext`**:
- Guard: if `state !== "proposal"`, return `{ committed: false, hasNext: false }` (no bypass of review)
- Capture `currentSlotNum = selectedSlotNum` and snapshot `committedPlays` before calling commit
- Call `commitProposal()`
- If returns `false` (validation fail or overwrite-review triggered): return `{ committed: false, hasNext: false }`
- On success: build filtered list from captured `committedPlays` where `odkFilter === "ALL"` or `play.odk === odkFilter`, find index of `currentSlotNum`, if next exists call `selectSlot(next.playNum)` and return `{ committed: true, hasNext: true }`, otherwise `deselectSlot()` and return `{ committed: true, hasNext: false }`

**Provider value**: Add `setActivePass`, `odkFilter`, `setOdkFilter`, `commitAndNext` to the context provider.

**updateField guard**: When `fieldDef.defaultPassEntry > activePass`, reject the update (return early without modifying candidate). This enforces read-only at the data level, not just the UI level.

---

## 2. SlotsGrid.tsx

### Changes

**Imports**: Add `ToggleGroup`, `ToggleGroupItem` from `@/components/ui/toggle-group`. Add `odkFilter`, `setOdkFilter` from `useTransaction()`.

**ODK Filter Toggle**: Insert between header row and table. Four buttons: ALL, O, D, K. Single-select via `ToggleGroup type="single"`. Active button uses default variant.

**Filtered display**: Compute `filteredPlays = odkFilter === "ALL" ? committedPlays : committedPlays.filter(p => p.odk === odkFilter)`. Render only filtered rows. Update header count to show `"Offensive Plays (X of Y)"` format when filtered, or `"Play Slots (Y)"` when ALL.

**Selection stability**: Selected row remains highlighted if visible. Clicking any row still calls `selectSlot(playNum)`.

---

## 3. DraftPanel.tsx

### Changes

**Imports**: Add `ToggleGroup`, `ToggleGroupItem` from `@/components/ui/toggle-group`. Add `ChevronRight` from lucide-react. Add `activePass`, `setActivePass`, `commitAndNext` from `useTransaction()`.

**Workflow Stage Selector**: Rendered right after the `if (!activeGame)` guard (before the slot-idle early return), so it is always visible. Uses a `ToggleGroup` with four items:
- "Game Setup" -- value `"0"`, calls `setActivePass(0)`
- "Basic Play Data" -- value `"1"`, calls `setActivePass(1)`
- "Manage Personnel" -- disabled, `opacity-50`, title="Coming soon"
- "Enter Grades" -- disabled, `opacity-50`, title="Coming soon"

**Stage-based field locking in `renderField()`**: For each field, look up `fieldDef.defaultPassEntry`. If `defaultPassEntry > activePass`:
- Input/Select/Switch/LookupCombobox: set `disabled={true}`
- Add `opacity-50` to the field wrapper
- Append "(not in current stage)" as subtle text below the label
- The `disabled` prop already prevents `onChange` from firing, plus the `updateField` guard in transaction.tsx provides a second layer of protection

The existing `disabled={isProposal}` becomes `disabled={isProposal || fieldDef.defaultPassEntry > activePass}`. Same for LookupCombobox and Switch components.

**Commit and Next button**: In the proposal state block (lines 370-390), when `isSlotMode`, add a third button after "Commit":
```
[Back to Edit] [Commit] [Commit & Next >>]
```
- Calls `commitAndNext()` from context
- On `{ committed: true, hasNext: false }`: `toast("End of filtered list.")`
- On `{ committed: false }`: no action (overwrite dialog or validation handles it)
- Only rendered when `isSlotMode === true`

---

## Files NOT Changed
- All `src/engine/*` files (schema.ts, db.ts, validation.ts, types.ts, export.ts)
- src/components/GameBar.tsx, StartGameDialog.tsx, NewGameDialog.tsx, SlotsGrid is changed
- src/pages/Index.tsx

## Acceptance Criteria
1. Stage selector always visible during logging
2. Only Game Setup and Basic Play Data selectable; Personnel and Grades disabled
3. Switching stage changes editable field set only -- no data mutation
4. Fields with `defaultPassEntry > activePass` are visible but disabled (read-only)
5. Commit and Next advances through filtered scaffold list
6. No advancement on failed validation or overwrite cancel
7. ODK filter is display-only, does not mutate data
8. Proposal vs committed state visually distinct
9. Full offensive game loggable sequentially with O filter + Commit and Next
10. Export includes Pass 1 fields with zero cleanup
11. No prediction logic anywhere

