

# Phase 4 Completion Plan — Two Corrections Applied

This plan incorporates two corrections to the previously approved Phase 4 completion plan. All other details from the prior plan remain unchanged.

---

## Correction 1: SCHEMA_VERSION = "2.1.0"

The version bump is a minor addition (new fields, new outputLabel property), not a breaking change. Use `"2.1.0"` instead of `"3.0.0"`.

**In schema.ts**: Change `SCHEMA_VERSION` from `"2.0.0"` to `"2.1.0"`.

---

## Correction 2: Narrow Lookup Validation Skip via `lookupMode`

### Problem

The prior plan said: "skip `validateLookupField` for all fields with `allowedValues`." This is too broad -- it would skip season lookup validation for dependent LOOKUP-sourced fields like `offStrength` and `personnel` that legitimately have `allowedValues` but should still participate in lookup governance if needed.

### Solution: Add `lookupMode` to FieldDefinition

Add an optional property to the schema interface:

```typescript
export interface FieldDefinition {
  // ... existing properties ...
  /** Controls lookup validation behavior.
   *  - "season": validated against season-maintained lookup table (offForm, offPlay, motion)
   *  - "fixed": validated by allowedValues enum only, not season lookup (penalty)
   *  - undefined: no lookup validation (COACH fields, LOGIC fields, dependent LOOKUP fields with allowedValues)
   */
  lookupMode?: "season" | "fixed";
}
```

### Field assignments

| Field | source | lookupMode | Validation behavior |
|-------|--------|------------|-------------------|
| offForm | LOOKUP | `"season"` | Checked against season lookup table |
| offPlay | LOOKUP | `"season"` | Checked against season lookup table |
| motion | LOOKUP | `"season"` | Checked against season lookup table |
| penalty | COACH | `"fixed"` | Validated by `allowedValues` only (existing enum check); `validateLookupField` skipped |
| offStrength | LOOKUP | (none) | Validated by `allowedValues` enum check; no season lookup table for this field exists |
| personnel | LOOKUP | (none) | Same as offStrength |
| playType | LOOKUP | (none) | Same |
| playDir | LOOKUP | (none) | Same |
| motionDir | LOOKUP | (none) | Same |
| penYards | LOOKUP | (none) | Integer validation only |
| result | COACH | (none) | Validated by `allowedValues` enum check |
| All other COACH fields | COACH | (none) | Standard type validation |

### validation.ts change

In `validateLookupField`, replace the prior plan's "skip if `allowedValues` defined" guard with:

```typescript
function validateLookupField(
  fieldDef: FieldDefinition,
  value: unknown,
  lookups: Map<string, string[]> | undefined,
  mode: "error" | "warning"
): string | null {
  // Only validate fields with lookupMode "season"
  if (fieldDef.lookupMode !== "season") return null;
  if (value === null || value === undefined || value === "") return null;
  if (!lookups) return null;
  // ... rest unchanged (check against season lookup table)
}
```

This means:
- `offForm`, `offPlay`, `motion` (lookupMode "season") are validated against season lookup tables -- exactly as today
- `penalty` (lookupMode "fixed") skips season lookup validation, relies on allowedValues enum check
- Dependent LOOKUP fields without lookupMode (offStrength, personnel, etc.) skip season lookup validation, rely on allowedValues enum check
- COACH fields without lookupMode skip season lookup validation as before

### Why this is better

- No hardcoded field-name checks in validation logic
- Schema-driven: adding a new "fixed vocab" field in the future just requires setting `lookupMode: "fixed"`
- Season-maintained lookups are explicitly opt-in via `lookupMode: "season"`
- Dependent LOOKUP fields with `allowedValues` are correctly excluded from season lookup checks (no season table exists for them) without an overly broad skip rule

---

## Summary of All Other Plan Details (Unchanged)

Everything else from the previously approved plan remains exactly as stated:

- 11 new fields added to PlayRecord/schema with correct sources (penalty.source = COACH, penYards/offStrength/personnel/playType/playDir/motionDir.source = LOOKUP)
- twoMin and eff stored as "Y"/"N" enum strings
- PENALTY_VALUES (37 entries), PENALTY_YARDS_MAP, EFF_VALUES constants
- outputLabel on all FieldDefinitions for Hudl CSV headers
- ActorCombobox for roster-backed actor fields with commit-gate enforcement
- Relational lookup governance (auto-populate dependents, clear on parent clear)
- Raw input pipeline: DB_VERSION 4, raw_input store, deterministic anchor-based parser (exact match only, no fuzzy), parse report with ambiguous/unrecognized status
- CSV export with escapeCSV, schema-driven column order, outputLabel headers
- Start Game ODK block startPlay auto-increment
- 3 new files (ActorCombobox.tsx, rawInputContext.tsx, rawInputParser.ts), 10+ modified files
- No prediction, no personnel positions, no AI inference

