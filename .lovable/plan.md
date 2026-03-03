

## Phase 9.1 — Season Configuration Persistence + Audit Backbone ✅

### Summary of Changes

9 files touched (3 new, 6 modified). IDB bumped from v5 to v6. Adds season-level config persistence, config audit trail, config mode UI with commit gating, and fieldSize lock based on committed play count.

### Files Created

**A) `src/engine/configStore.ts`** — Pure types + helpers
- `SeasonConfig` type with `seasonId`, `version`, `updatedAt`, `updatedBy: "local"`, `fieldSize: 80|100`, `activeFields: Record<string, boolean>`
- `ConfigAuditRecord` type with `id?`, `seasonId`, `eventId`, `at`, `type: "CONFIG_CHANGE"`, `versionBefore`, `versionAfter`, `changes: Array<{ key, before, after }>`
- `buildDefaultConfig(seasonId, fieldKeys)` — returns version=1, fieldSize=80, all keys true
- `diffConfig(before, after)` — compares top-level `fieldSize` + nested `activeFields.<key>` diffs; returns changes array, empty if identical

**B) `src/components/ConfigModeDialog.tsx`** — Modal dialog
- Props: `open`, `onOpenChange`
- On open: loads config via `getSeasonConfig(seasonId)` or falls back to `buildDefaultConfig`; sets `configMode = true` in season context
- On close: sets `configMode = false`
- UI: fieldSize toggle (80/100) + activeFields checklist from `playSchema.map(f => f.name)`
- **fieldSize lock**: on open, calls `countSeasonCommittedPlays(seasonId)`. If count > 0, disables fieldSize control and shows helper text: "Field size is locked after plays have been committed to protect determinism."
- Save: diffs against loaded config, calls `saveSeasonConfig(after, before)`, toasts success, closes

**C) `src/test/configStore.test.ts`** — Unit tests
- `buildDefaultConfig` returns version=1, fieldSize=80, all keys true
- `diffConfig` detects changed `fieldSize`
- `diffConfig` detects changed nested `activeFields.offForm`
- `diffConfig` returns empty for identical configs

### Files Modified

**D) `src/engine/db.ts`** — IDB v5 → v6
- Bump `DB_VERSION` to 6
- Add stores in upgrade: `config` (keyPath `seasonId`), `config_audit` (autoIncrement, index `bySeason` on `seasonId`)
- Add `getSeasonConfig(seasonId): Promise<SeasonConfig | undefined>`
- Add `saveSeasonConfig(after, before)`: single tx on `["config", "config_audit"]` — calls `diffConfig`, skips if no changes, otherwise increments version, sets updatedAt/updatedBy, puts config, adds audit record with UUID eventId
- Add `getConfigAuditBySeason(seasonId): Promise<ConfigAuditRecord[]>`
- Add `countSeasonCommittedPlays(seasonId)`: gets all games where `seasonId` matches, then for each game counts plays via `byGame` index on the `plays` store, returns total. Plays store ONLY contains committed rows.
- Extend `buildDebugExport` to include `config` and `configAudit` when season data present
- Extend `buildSeasonPackageExport` to include optional `config` if found
- Extend `importSeasonPackageNewSeason` to write config under `newSeasonId` if present in package; add `"config"` to the tx store list

**E) `src/engine/seasonContext.tsx`**
- Add `configMode: boolean` state (default false) + `setConfigMode: (v: boolean) => void` to context interface and provider

**F) `src/engine/transaction.tsx`**
- Import `useSeason`, read `configMode`
- At top of `reviewProposal` callback: if `configMode`, toast "Exit Configuration Mode first." and return
- At top of `commitProposal` callback: same guard

**G) `src/components/GameBar.tsx`**
- Import `ConfigModeDialog`, add `configOpen` state
- Add "Config" button next to season controls, visible when `activeSeason` exists (no game gate)
- Render `<ConfigModeDialog open={configOpen} onOpenChange={setConfigOpen} />`

**H) `src/components/StartGameDialog.tsx`**
- On dialog open, load `getSeasonConfig(activeSeason.seasonId)` and if found, use its `fieldSize` as the default for the local `fieldSize` state instead of hardcoded "80".

**I) `src/engine/seasonTransfer.ts`**
- Import `SeasonConfig` type from configStore
- Add optional `config?: SeasonConfig` to both `SeasonPackage` and `NormalizedSeasonPackage` types
- In `normalizeSeasonPackageImport`, pass through `config` if present in payload
