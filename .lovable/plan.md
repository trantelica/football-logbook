# Configurable Export Profiles

## What it means for the product

Today the Hudl export uses one fixed list of columns. Making that list configurable lets another coach match their own Hudl column setup, for example naming position 2 "H" or dropping columns they don't use. It has these effects:

- **Gains:** other programs can adopt the app without code changes. Aliases like H can appear in the export headers if the coach wants. Columns that aren't used can be left out.
- **Risks:**
  - A bad profile can produce a file Hudl rejects. Validation is required.
  - Old exports and archives must stay reproducible, so each export records the profile it used.
  - The export tests that lock the current contract become tests of the **default profile**, not the only profile.
- **What stays fixed:** the internal data (fields like pos2 and grade2) does not change. A profile only maps internal fields to column names and order. The parser, passes, commits and stored data are not touched.

## Proposed approach

1. **Default profile = today's contract**, built in and read-only. With no custom profile, exports stay exactly as they are now.
2. **Export Profile per season**: an ordered list of columns. Each column has:
   - a source field (from the known schema fields)
   - a header label (optional; can be filled from the position alias)
   - whether it's included
3. **Profile editor** in Workspace/Season settings:
   - reorder, rename and hide columns
   - "Use position aliases as headers" toggle
   - reset to default
   - import or export a profile as JSON so it can be shared between coaches
4. **Validation before saving and before export:**
   - no duplicate headers
   - only known source fields
   - required Hudl columns (such as PLAY #) can't be removed
   - a warning when the profile differs from the default
5. **Traceability:** the export manifest and session archives record the profile name, its version and a hash of the profile.
6. **Locking:** a profile can change at any time because it only affects output. Each change creates a new version, so past exports stay explainable.

## Technical details

- New `ExportProfile { id, name, version, columns: { sourceField, header, include }[] }`. It is stored season-scoped in IndexedDB (a new store or a config entry). If it needs a schema bump, that bump is planned on its own.
- `hudlExport.ts` stays pure: `buildHudlCsv(plays, profile = DEFAULT_PROFILE)`. `HUDL_HEADERS` becomes the source for `DEFAULT_PROFILE`.
- Existing rules stay: one row for every slot, no early return in `handleHudlExport`, and preflight validation stays advisory.
- Tests:
  - the default profile matches the current CSV byte for byte
  - aliasing, reordering and hiding columns
  - validation rejects bad profiles
  - the manifest includes the profile hash

## Out of scope

- Computed or derived columns (formulas)
- Export targets other than Hudl
- Cloud sharing of profiles
