

## Phase 8.1: Hudl Export Contract + Versioned Manifest

### Files to Create (2)

1. **`src/engine/hudlExport.ts`** — Pure export functions (no DB imports)
2. **`src/test/hudlExport.test.ts`** — Deterministic tests

### Files to Modify (2)

3. **`src/engine/schema.ts`** — Add `APP_VERSION = "1.0.0"`
4. **`src/components/StatusBar.tsx`** — Replace CSV+Notes buttons with "Hudl Export" button; add preflight error dialog; orchestration fetches from DB here

---

### `src/engine/schema.ts`

Add `export const APP_VERSION = "1.0.0";` near `SCHEMA_VERSION`.

### `src/engine/hudlExport.ts`

Pure module, no DB imports. Contains:

**Constants:**
- `EXPORT_FORMAT_VERSION = "8.1.0"`
- `HUDL_PLAYS_FILENAME = "hudl_plays.csv"`
- `HUDL_NOTES_FILENAME = "hudl_notes.csv"`
- `EXPORT_MANIFEST_FILENAME = "export_manifest.json"`

**`HUDL_HEADERS`** — Frozen array matching current `playsToCSV` column contract exactly (all 48 fields from `playSchema` in order):
```
PLAY #, QTR, ODK, SERIES, YARD LN, DN, DIST, HASH,
OFF FORM, OFF PLAY, MOTION, RESULT, GN/LS, 2 MIN,
RUSHER, PASSER, RECEIVER, PENALTY, PEN YARDS, EFF,
OFF STR, PERSONNEL, PLAY TYPE, PLAY DIR, MOTION DIR, PAT TRY,
LT, LG, C, RG, RT, X, Y, POS 1, POS 2, POS 3, POS 4, RETURNER,
LT GRADE, LG GRADE, C GRADE, RG GRADE, RT GRADE,
X GRADE, Y GRADE, 1 GRADE, 2 GRADE, 3 GRADE, 4 GRADE
```
Each entry: `{ key: string, label: string }`. Object.freeze'd.

**`NOTES_HEADERS`** — Same columns as existing `NOTES_CSV_COLUMNS`.

**`escapeCSV(value)`** — Same logic as existing.

**`toHudlCsv(plays: PlayRecord[]): string`**
- Sort by playNum asc
- Map through HUDL_HEADERS only
- null/undefined → empty string
- Empty plays → header row only (not empty string like current)

**`toNotesCsv(plays, notes): string`**
- Filter soft-deleted, exclude notes with no matching play
- Join derived context from plays
- Sort by playNum then createdAt

**`validateForExport(plays): { valid, errors[] }`**
Tiers:
- A) Always: playNum present/integer/>0, unique; enum fields if present must be in allowedValues
- B) Conditional: patTry present → playType must equal `patTryToPlayType(patTry)`; patTry present OR playType in ["Extra Pt.", "2 Pt."] → result must be null/blank or in `PAT_RESULTS`
- C) Do NOT require optional fields, offense-only fields when odk≠"O", or lookup defaults

**`buildExportManifest(params): ExportManifest`**
```ts
{
  appVersion: string,
  exportFormatVersion: string,
  lookupStoreVersion: string,  // "unknown" for now (no semver store yet)
  seasonRevision: number,
  exportedAt: string,          // ISO
  counts: { plays: number, notes: number }
}
```
`lookupStoreVersion` = `"unknown"` (real semver deferred until lookup governance tracks one). `seasonRevision` = integer passed in from season context.

**`triggerDownload(content, filename, mimeType)`** — Anchor-click helper.

### `src/components/StatusBar.tsx`

- Remove CSV and Notes buttons
- Add "Hudl Export" button (disabled when committedPlays.length === 0)
- On click:
  1. Fetch plays via `getPlaysByGame`, notes via `getCoachNotesByGame`, season from context for `seasonRevision`
  2. `validateForExport(plays)`
  3. Invalid → open error dialog (scrollable, grouped by play#)
  4. Valid → `toHudlCsv`, `toNotesCsv`, `buildExportManifest`, trigger 3 downloads, toast success
- Keep Debug JSON + Copy buttons unchanged
- Add `PreflightErrorDialog` component within file

### `src/test/hudlExport.test.ts`

1. Header stability: `toHudlCsv([])` → exactly HUDL_HEADERS labels as header row
2. Sorting: unordered → sorted by playNum
3. Blank handling: null/undefined → empty cells, never "null"/"undefined"
4. No mutation: deep-clone, export, compare unchanged (both `toHudlCsv` and `validateForExport`)
5. Preflight: missing playNum → invalid; duplicate playNum → error
6. PAT consistency: patTry="1" + playType≠"Extra Pt." → error
7. PAT override: playType="Extra Pt." + patTry="1" → passes
8. Notes: excludes soft-deleted + missing-play notes
9. Manifest: correct keys/types, lookupStoreVersion="unknown", seasonRevision is number

