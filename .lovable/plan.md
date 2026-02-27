

## Phase 7 Slice 7.1: Pass 3 Blocking & Grading MVP

### Files to Create (2)

1. **`src/components/BlockingPanel.tsx`** — Pass 3 UI with read-only context, read-only personnel (from committedRow), grade grid
2. **`src/components/GradeOverwriteDialog.tsx`** — Field-scoped overwrite confirmation for grade changes

### Files to Modify (7)

3. **`src/engine/types.ts`** — Add 11 `grade*: number | null` fields to `PlayRecord` (after `returner`)
4. **`src/engine/schema.ts`** — Add 11 grade field definitions to `playSchema` (after `returner`, before closing `] as const`). `dataType: "integer"`, `allowedValues: ["-3","-2","-1","0","1","2","3"]`, `defaultPassEntry: 3`, `requiredAtCommit: false`, `defaultPolicy: "null"`, `source: "COACH"`
5. **`src/engine/personnel.ts`** — Add `GRADE_FIELDS`, `GRADE_LABELS`, `anyGradePresent(row)` exports
6. **`src/engine/validation.ts`** — No changes needed (existing `validateField` for `dataType:"integer"` + `allowedValues` already handles [-3..3] validation)
7. **`src/engine/transaction.tsx`** — Pass 3 logic:
   - Add `gradeOverwriteDiffs` state + `pendingGradeSnapshot` state
   - Add `confirmGradeOverwrite()` / `cancelGradeOverwrite()` callbacks
   - Expose via context
   - `reviewProposal`: when `activePass === 3`, skip all Pass 1/2 logic (PAT, EFF, QC, TD correction, penalty defaults, personnel validation, possession). Only run inline validation on touched fields. Transition to "proposal"
   - `commitProposal`: when `activePass === 3`:
     - Find committedRow from `committedPlays` by `selectedSlotNum`
     - Hard reject if no committedRow or committedRow.odk !== "O"
     - Validate touched grade fields
     - Normalize only grade fields to integers
     - Compute grade overwrite diffs (committedRow vs normalized proposal, trigger when before !== null AND after !== before)
     - If diffs exist: store `pendingGradeSnapshot` (frozen normalized snapshot) + `gradeOverwriteDiffs`, return false
     - Otherwise: **field-scoped persist** — merge only grade fields onto committedRow, write to DB
   - `confirmGradeOverwrite()`: use `pendingGradeSnapshot` (not live candidate) to do the field-scoped merge+write
   - `updateField`: allow grade fields when `activePass === 3` (they have `defaultPassEntry: 3`)
8. **`src/components/DraftPanel.tsx`** — Changes:
   - `WORKFLOW_STAGES[3]`: set `enabled: true`, label → `"Pass 3: Blocking"`
   - Render `<BlockingPanel />` when `activePass === 3` (alongside existing Pass 2 / Pass 1 branching)
   - Review Proposal disabled condition for Pass 3: enabled iff touchedFields intersects GRADE_FIELDS
   - Wire `<GradeOverwriteDialog />` from transaction context state
9. **`src/components/SlotsGrid.tsx`** — Add Pass 3 badges:
   - Import `anyGradePresent` from personnel
   - Legend: add "Blocking Graded" (emerald dot) and "Not Offense" (gray/muted text)
   - Per-row: if `play.odk !== "O"` → "Not Offense" badge; if `play.odk === "O"` && `anyGradePresent(play)` → "Blocking Graded" badge

### File to Add (1)

10. **`src/test/grading.test.ts`** — Tests:
    - `anyGradePresent` returns false for all-null, true when ≥1 grade set
    - Grade validation: reject 4, accept -3, 0, 3, null
    - ODK gating: commit blocked when committedRow.odk !== "O"
    - ODK gating: commit blocked when no committedRow
    - Overwrite: null→1 no diff; 2→1 produces diff; 2→null produces diff
    - Stored grades are `number|null` after normalization
    - Export: `playsToCSV` includes grade columns

### Key Implementation Details

**Field-scoped commit (Addendum 1)**: When `activePass === 3`, `commitProposal` builds a merged play by copying the committedRow and overwriting ONLY the 11 grade fields from the normalized proposal. All other fields remain exactly as they are in the committed row.

**Stable overwrite snapshot (Addendum 2)**: When grade overwrite diffs are detected, freeze a `pendingGradeSnapshot` (the normalized grade values at diff-detection time). `confirmGradeOverwrite()` uses this snapshot, not live candidate state, preventing edits-while-dialog-open from changing what gets committed.

**SlotsGrid "Not Offense" badge (Addendum 3)**: Condition is simply `play.odk !== "O"` (committed row exists by virtue of being in `committedPlays`). No "has any committed data" heuristic.

**Export**: `playsToCSV` already iterates `playSchema` — adding grade fields to schema automatically includes them in CSV output. No changes needed to db.ts.

**BlockingPanel personnel display**: Reads committedRow (found via `committedPlays.find(p => p.playNum === selectedSlotNum)`), not candidate. Uses `useRoster()` roster array to map jersey → name.

**Grade Select UI**: Each position gets a `<Select>` with options: blank, -3, -2, -1, 0, 1, 2, 3. String values from Select are stored via `updateField`, and `normalizeToSchema` handles integer conversion at commit time.

