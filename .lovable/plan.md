

# Phase 2: Lookup and Roster Governance — Implementation Plan

## Overview

Season-scoped vocabulary governance for three LOOKUP fields (`offForm`, `offPlay`, `motion`), a lightweight roster store (`jerseyNumber` + `playerName`), and full audit trail with `seasonRevision` counter. All committed plays remain denormalized. No scope creep into multi-pass, carry-forward, or personnel logic.

---

## Implementation Sequence

The build is ordered to maintain a working application at each step. Engine layer first, then contexts, then UI.

### Step 1: Types and Schema Updates

**`src/engine/types.ts`** — Add new types:
- `SeasonMeta`: `seasonId`, `label`, `createdAt`, `seasonRevision`
- `LookupTable`: `seasonId`, `fieldName`, `values: string[]`, `updatedAt`
- `LookupAuditRecord`: `seasonId`, `fieldName`, `action` (add/remove), `value`, `seasonRevision`, `timestamp`
- `RosterEntry`: `seasonId`, `jerseyNumber`, `playerName`
- `RosterAuditRecord`: `seasonId`, `jerseyNumber`, `playerName`, `action` (add/remove/update), `seasonRevision`, `timestamp`
- Add `seasonId: string` to `GameMeta`

**`src/engine/schema.ts`**:
- Change `source` to `"LOOKUP"` for `offForm`, `offPlay`, `motion`
- `result` stays `source: "COACH"` (fixed spec enum, not season-maintainable)
- Bump `SCHEMA_VERSION` to `"2.0.0"`

### Step 2: IndexedDB Layer

**`src/engine/db.ts`** — Bump `DB_VERSION` to 2. Add five stores:

| Store | KeyPath | Indexes |
|-------|---------|---------|
| `seasons` | `seasonId` | -- |
| `lookups` | `[seasonId, fieldName]` | `bySeason` |
| `lookup_audit` | auto-increment | `bySeason` |
| `roster` | `[seasonId, jerseyNumber]` | `bySeason` |
| `roster_audit` | auto-increment | `bySeason` |

New functions:
- **Seasons**: `createSeason`, `getAllSeasons`, `getSeason`, `incrementSeasonRevision`
- **Lookups**: `getLookupTable`, `getAllLookups`, `addLookupValue`, `removeLookupValue`, `initDefaultLookups`
- **Roster**: `getRosterBySeason`, `addRosterEntry`, `removeRosterEntry`, `updateRosterEntry`
- **Debug export**: Include `seasons`, `lookups`, `lookup_audit`, `roster`, `roster_audit`

Lookup canonicalization applied in `addLookupValue` and all comparison paths:
- Trim leading/trailing whitespace
- Collapse multiple internal spaces to single space
- Preserve coach casing (no case normalization)
- Comparisons use canonicalized forms

Lookup removal safety (Option A): `removeLookupValue` queries the `plays` store for any committed play in the season using that value. If found, throw/return error. Caller handles the UI message.

### Step 3: Season Context

**`src/engine/seasonContext.tsx`** (new file):
- State: `activeSeason`, `seasons` list
- `createNewSeason(label)`: creates season, calls `initDefaultLookups(seasonId)`
- `switchSeason(seasonId)`: with confirmation if draft is active (similar to game switch pattern)
- `pendingSwitchSeason` / `confirmSeasonSwitch` / `cancelSeasonSwitch` for draft-clearing confirmation

### Step 4: Lookup Context

**`src/engine/lookupContext.tsx`** (new file):
- Loads all lookup tables for `activeSeason.seasonId` on mount/season change
- `getValues(fieldName): string[]`
- `addValue(fieldName, value)`: canonicalizes, checks duplicate, adds, increments `seasonRevision`, writes audit
- `removeValue(fieldName, value)`: checks committed plays for usage, blocks if found, otherwise removes + audits
- `isLookupField(fieldName): boolean`

### Step 5: Roster Context

**`src/engine/rosterContext.tsx`** (new file):
- Loads roster for `activeSeason.seasonId`
- `roster: RosterEntry[]`
- `addPlayer(jerseyNumber, playerName)`: increments `seasonRevision`, writes audit
- `removePlayer(jerseyNumber)`: increments `seasonRevision`, writes audit
- `updatePlayer(jerseyNumber, playerName)`: increments `seasonRevision`, writes audit
- `getPlayer(jerseyNumber): RosterEntry | undefined`
- No duplicate detection, no position logic, no 11-player enforcement

### Step 6: Validation Engine Integration

**`src/engine/validation.ts`**:
- `validateCommitGate(candidate, activePass, lookups)` — new third parameter: `Map<string, string[]>` (fieldName to approved values)
- For fields with `source === "LOOKUP"`: if lookup map has a non-empty array for that field and the canonicalized candidate value is not in it, error: `"{label} is not a recognized value"`
- If lookup array is empty, accept any value (bootstrapping)
- `validateInline(candidate, touchedFields, lookups)` — optional lookup map. For LOOKUP fields with non-empty table, soft warning if value not found

### Step 7: Transaction Provider Update

**`src/engine/transaction.tsx`**:
- Import and consume `useLookup` context
- Pass lookup map to `validateCommitGate` and `validateInline` calls
- No other structural changes

### Step 8: Game Context Update

**`src/engine/gameContext.tsx`**:
- `createNewGame(opponent, date, seasonId)` — requires `seasonId`
- `GameMeta` now includes `seasonId`

### Step 9: UI — Season Management in GameBar

**`src/components/GameBar.tsx`**:
- Add season selector dropdown before game selector
- "New Season" button opens a dialog for entering season label
- Display active season label
- Season switch triggers draft-clearing confirmation (same pattern as game switch)

**`src/components/NewGameDialog.tsx`**:
- Add season selector dropdown (from available seasons)
- If no seasons exist, show prompt to create one first
- Game creation requires a selected season

### Step 10: UI — Lookup Combobox in DraftPanel

**`src/components/DraftPanel.tsx`**:
- For fields where `fieldDef.source === "LOOKUP"`, render a combobox using `cmdk` (already installed)
- Always use combobox UI, even when lookup table is empty (bootstrapping)
- Empty state: show "No values yet. Type to add."
- Dropdown shows approved values filtered by typed input
- If typed value is not in the list, show "Add '{value}'?" option
- Selecting "Add" triggers `LookupConfirmDialog`
- Read-only in proposal state

### Step 11: UI — Lookup Confirm Dialog

**`src/components/LookupConfirmDialog.tsx`** (new file):
- Modal: "Add '{value}' to {fieldLabel}?"
- Confirm calls `lookupContext.addValue(fieldName, value)`
- Cancel clears the field
- After confirm, field retains the value and logging resumes

### Step 12: UI — Lookup Management Panel

**`src/components/LookupPanel.tsx`** (new file):
- Collapsible panel below DraftPanel
- One section per LOOKUP field (offForm, offPlay, motion)
- Approved values shown as removable chips
- Remove button: if value used in committed plays, show "Value used in committed plays. Removal blocked."
- Text input to manually add values (uses same canonicalization + confirm flow)
- Displays `seasonRevision` and `updatedAt` per field
- Only visible when a season is active

### Step 13: UI — Roster Management Panel

**`src/components/RosterPanel.tsx`** (new file):
- Collapsible panel
- Table: jerseyNumber + playerName
- Add row: jersey input + name input + Add button
- Remove button per row
- Only visible when a season is active

### Step 14: Page Layout Update

**`src/pages/Index.tsx`**:
- Updated provider hierarchy:
```text
GameProvider
  SeasonProvider
    LookupProvider
      RosterProvider
        TransactionProvider
          ...UI
```
- Add `LookupPanel` and `RosterPanel` to the main layout (collapsible, below DraftPanel)

---

## Canonicalization Rules

Applied consistently before add, before comparison, and before commit:
1. Trim leading/trailing whitespace
2. Collapse multiple internal spaces to a single space
3. Preserve coach casing exactly (no uppercase/lowercase normalization)

---

## Lookup Removal Safety (Phase 2: Option A)

When removing a lookup value:
1. Query all committed plays in the season where that field equals the value
2. If any exist: block removal, show message "Value used in committed plays. Removal blocked."
3. If none: proceed with removal, increment `seasonRevision`, write audit

---

## Bootstrapping Behavior

- Empty lookup tables are permissive (accept any value at commit-gate)
- Combobox UI is always used (no degradation to plain input)
- Empty state shows: "No values yet. Type to add."
- Normal "Add '{value}'?" flow applies from the very first entry
- Bootstrapping applies only at season creation, not game creation

---

## Determinism Guardrails

- Committed plays remain denormalized (lookup edits never rewrite history)
- Season switch clears Candidate/Proposal state with confirmation dialog
- No silent lookup mutations (all changes require explicit user action)
- Debug export includes: `seasons`, `lookups`, `lookup_audit`, `roster`, `roster_audit`
- `seasonRevision` is monotonic, audit-only, does not create new seasons

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/engine/types.ts` | Modify | Add SeasonMeta, LookupTable, LookupAuditRecord, RosterEntry, RosterAuditRecord; add seasonId to GameMeta |
| `src/engine/schema.ts` | Modify | offForm/offPlay/motion source to LOOKUP; bump to 2.0.0 |
| `src/engine/db.ts` | Modify | DB_VERSION 2; 5 new stores; CRUD functions; canonicalization; removal safety; debug export |
| `src/engine/seasonContext.tsx` | Create | Season state management provider |
| `src/engine/lookupContext.tsx` | Create | Lookup table state, add/remove with canonicalization and audit |
| `src/engine/rosterContext.tsx` | Create | Roster state, add/remove/update with audit |
| `src/engine/validation.ts` | Modify | Lookup membership check in commit-gate and inline validation |
| `src/engine/transaction.tsx` | Modify | Pass lookup map to validation calls |
| `src/engine/gameContext.tsx` | Modify | createNewGame accepts seasonId |
| `src/engine/export.ts` | Modify | Include season data in debug export |
| `src/components/DraftPanel.tsx` | Modify | Combobox for LOOKUP fields with "Add new?" flow |
| `src/components/LookupConfirmDialog.tsx` | Create | Confirmation dialog for adding lookup values |
| `src/components/LookupPanel.tsx` | Create | Collapsible lookup management UI |
| `src/components/RosterPanel.tsx` | Create | Collapsible roster management UI |
| `src/components/GameBar.tsx` | Modify | Season selector, season switch confirmation |
| `src/components/NewGameDialog.tsx` | Modify | Season selection required for game creation |
| `src/pages/Index.tsx` | Modify | Provider hierarchy; add LookupPanel and RosterPanel |

---

## Out of Scope (Confirmed)

- Pass-aware activation
- Carry-forward / predict / process logic
- Roster validation rules (duplicates, positions, 11-player)
- Personnel constraints / grading
- Rapid entry UX / keyboard shortcuts
- Audit viewer UI
- `result` as LOOKUP (remains fixed spec enum)

