
# Slice F2.a — Deterministic Lookup Assist (Implementation Plan)

Approved scope only. Deterministic candidate retrieval for the three Pass 1 Play Details governed parents (`offForm`, `offPlay`, `motion`), surfaced through a grouped extension of the existing `RawInputCollisionDialog`. No AI ranking, no edge-function changes, no schema/Hudl changes, no Pass 2/3, no transaction or scanner edits, no auto-apply, no commit, no governance bypass.

## Step 1 — Pure modules + unit tests (land first, no UI wiring)

### 1a. `src/engine/sttEditDistance.ts` (new)

Pure single-token Damerau–Levenshtein helper. ~50 lines. No I/O.

```ts
/** Damerau-Levenshtein distance between two whole tokens. Case-insensitive,
 *  whitespace-trimmed. Returns Infinity for empty inputs. */
export function tokenEditDistance(a: string, b: string): number;

/** Bounded check used by Lookup Assist:
 *  - distance ≤ 1 always allowed
 *  - distance ≤ 2 only when the canonical token length ≥ 6
 *  - both inputs must be single tokens (no whitespace) */
export function isBoundedSttMatch(coachToken: string, canonicalToken: string): boolean;
```

Hard rules: single-token only, no phonetic, no multi-word.

### 1b. `src/engine/lookupAssist.ts` (new)

Pure: no React, no IDB, no console, no mutation of inputs.

```ts
import type { GovernedLookupField, LookupScanResult } from "./lookupScanner";

export type AssistSignal =
  | "exact" | "prefix" | "contains" | "numeric" | "stt_edit" | "synonym" | "overlap";

export interface AssistOption {
  canonical: string;        // verbatim from lookupMap.get(field)
  signals: AssistSignal[];  // dedup, deterministic order
}

export type AssistFieldResult =
  | { fieldName: GovernedLookupField; kind: "no_match"; cue: string }
  | {
      fieldName: GovernedLookupField;
      kind: "options";
      cue: string;
      knownOptions: AssistOption[];   // capped, ranked
      uniqueOption?: string;          // set only when single strong-signal candidate
      parserValue?: string;
    };

export interface AssistReport {
  perField: Partial<Record<GovernedLookupField, AssistFieldResult>>;
}

export interface CollectAssistInput {
  sectionText: string;                 // normalized Play Details text
  parserPatch: Readonly<Record<string, unknown>>;
  scannerResult?: Readonly<LookupScanResult> | null;
  lookupMap: ReadonlyMap<string, readonly string[]>;
  /** Fields the coach already touched in the candidate; suppresses assist. */
  touchedFields?: ReadonlySet<string>;
  /** Fields already filled in the candidate (non-empty); suppresses assist. */
  filledFields?: ReadonlySet<string>;
}

export function collectAssistCandidates(input: CollectAssistInput): AssistReport;
```

Per-field caps: offPlay ≤ 6, offForm ≤ 5, motion ≤ 5.

Suppression order (skip field entirely if any matches):
1. Scanner whole-canonical hit exists for that field (avoids duplicate of Slice B).
2. `touchedFields.has(field)` or `filledFields.has(field)`.

Signal extraction (per field, against canonicals from `lookupMap.get(field)`):
- `exact` — full normalized canonical present as substring of cue text (whole tokens).
- `numeric` — only for offPlay; any digit token in cue equals a digit token in canonical.
- `prefix` — coach token is whole-token prefix of canonical's first token; or coach multi-token sequence is prefix of canonical token list.
- `contains` — canonical contains a coach non-trivial token (length ≥ 3, not a stopword) as a whole token.
- `stt_edit` — `isBoundedSttMatch` between any coach token and any canonical token (single-token only).
- `overlap` — used only as a **ranking** boost (Jaccard over normalized non-stopword tokens); never introduces a candidate on its own.

Stopwords (small, local): `the, a, an, and, of, to, with, from, for, in, on, off, formation, motion, play`.

Ranking (descending): numeric > prefix > contains > stt_edit > exact > overlap-boost. Stable secondary by canonical alphabetical for determinism. Then capped.

`uniqueOption` set only when exactly one candidate has `numeric` or `prefix` and no other candidate carries either of those.

### 1c. `src/test/sttEditDistance.test.ts` (new)

Table-driven: identity → 0; insertion/deletion/substitution/transposition → 1; distance-2 cases; bounded gating (length-5 canonical with distance 2 → false; length-6 → true); empty inputs → Infinity; multi-token inputs rejected (return false from `isBoundedSttMatch`).

### 1d. `src/test/lookupAssist.test.ts` (new) — covers all 10 approved unit tests

1. offPlay `"the play is 26"` + `["26 Punch","26 Power","26 Pass","39 Sweep"]` → 3 options (`26 Punch`, `26 Power`, `26 Pass`), each with `numeric`.
2. offPlay `"Fake 26 Punch"` + `["26 Punch","26 Punch Fake"]` → both; `26 Punch Fake` ranked above `26 Punch` via overlap boost.
3. offForm `"Vader formation"` + `["Invader","Vader Tight","Black"]` → `Invader` (`stt_edit`), `Vader Tight` (`prefix`/`contains`); `Black` excluded.
4. motion `"Z acros motion"` + `["Z Across","Z Jet"]` → `Z Across` only with `stt_edit`.
5. Text `"hello world"` against governed lookups → all three fields return `no_match`.
6. Cap respected: 12 numeric matches for offPlay → 6 returned, deterministic ordering.
7. Scanner has whole-canonical hit for offForm → assist omits offForm entirely.
8. `touchedFields` includes `offPlay` → assist omits offPlay.
9. (covered by 1c, but a small inline reuse test confirms `stt_edit` triggers via the helper).
10. `uniqueOption` set when only one candidate has `prefix` and none others; not set when 2+ share strong signals.

## Step 2 — Grouped option support in `RawInputCollisionDialog` + tests

### 2a. Edit `src/components/RawInputCollisionDialog.tsx`

Extend the dialog-local `Collision` type (purely UI metadata; transaction.tsx untouched):

```ts
export interface Collision {
  fieldName: string;
  currentValue: unknown;
  proposedValue: unknown;
  source?: "ai_correction" | "lookup_assist";
  note?: string;
  /** Lookup Assist grouping. Rows with the same groupKey are mutually exclusive. */
  groupKey?: string;
  /** Coach-friendly chip text, e.g. "Number match", "Sounds like". */
  signalLabel?: string;
}
```

Behavior changes (additive; legacy paths unchanged when `groupKey` is absent):
- When any row has `source === "lookup_assist"`:
  - Title: `"Pick known values"` (unless mixed with `ai_correction` rows, in which case current AI title wins).
  - Subnote: `"Tap one per group, or skip."`
  - Render rows grouped by `groupKey` with a small section header derived from the field label (`Formation`, `Play`, `Motion`).
  - Selection state becomes per-group single-select: toggling a row in a group deselects siblings in the same `groupKey`. Initial selection: empty (coach must opt in).
  - Apply button label: `"Apply selected (N)"`.
  - Cancel button label: `"Skip"`.
- Coach-friendly `signalLabel` rendered as a small muted chip next to the proposed value. Internal codes (`stt_edit` etc.) never appear.
- Create-new is **deferred** in F2.a (option A from the prior plan): no "Create new" row. Coach can dismiss the dialog and either edit manually (existing field grid) or type a new value, which then routes through the existing lookup governance interrupt at Review/Commit time. This avoids any silent append path.

### 2b. Extend `src/test/rawInputCollisionDialog.test.tsx`

New cases (existing 5 cases preserved):
- Lookup-assist-only dialog: title `"Pick known values"`, group headers render, signal-label chips render.
- Single-select per group: clicking a second row in the same group deselects the first; rows in a different group remain independent.
- Apply with one selection per group calls `onConfirm` with exactly those `fieldName`s.
- Skip calls `onCancel`, never `onConfirm`.
- Mixed (lookup_assist + ai_correction) rows: AI rows keep their chip + per-row select; lookup-assist rows still enforce single-select within their group.

## Step 3 — Wire into `Pass1SectionPanel.tsx`

Only after Steps 1–2 tests pass.

After the existing `scanKnownLookups` block in `runUpdateProposal` (and only when `id === "playDetails"`):

1. Compute `filledFields` from current `candidate` (non-empty/non-null values for the three governed fields) and `touchedFields` from existing transaction state.
2. Call `collectAssistCandidates({ sectionText: normalizedText, parserPatch, scannerResult, lookupMap, touchedFields, filledFields })`.
3. For each `kind: "options"` field result, append one `Collision` row per `AssistOption` to the existing overwrite/review queue with:
   - `source: "lookup_assist"`
   - `groupKey: fieldName`
   - `currentValue`: existing candidate value (or `parserValue`)
   - `proposedValue`: `option.canonical`
   - `signalLabel`: mapped from the strongest signal (`numeric`→"Number match", `prefix`→"Starts with", `contains`→"Contains", `stt_edit`→"Sounds like", `synonym`→"Phrasing match", `exact`→"Exact").
4. On dialog confirm, for each selected row, call the **existing** `applySystemPatch({ [fieldName]: { value: option.canonical, matchType: "exact" } }, { fillOnly: false, source: "deterministic_parse" })`. This reuses the lookup governance interrupt path unchanged for the canonical (which, being from `lookupMap`, is already known and will pass governance silently — exactly as Slice B scanner behaves today).
5. Skip path: nothing applied, nothing committed.

Hard rules enforced in this wiring:
- All proposed values come verbatim from `lookupMap.get(field)` — no invention.
- `source: "deterministic_parse"` (coach picked a known canonical), never `ai_proposed`.
- No commit triggered.
- Scanner whole-match fields are already excluded inside `collectAssistCandidates`.

## Step 4 — Integration smoke test

`src/test/lookupAssistFlow.test.tsx` (mirrors the F1 harness pattern; does not render full `Pass1SectionPanel` to avoid IDB/provider seeding):

- Input: `"Vader formation, Fake 26 Punch, Z acros motion"` with seeded lookups for all three fields.
- Asserts dialog opens with three groups (Formation, Play, Motion), each with at least one option.
- Selects one option per group; Apply triggers `applySystemPatch` once per selection with the canonical, `fillOnly:false`, `source:"deterministic_parse"`; no commit spy fires.
- Skip path leaves spies un-called.
- A field with a scanner whole-match (e.g. seed `offForm` with full canonical present in text) is not rendered by Assist.
- AI-correction dialog test from Slice E remains green (regression).

## Files changed

New:
- `src/engine/sttEditDistance.ts`
- `src/engine/lookupAssist.ts`
- `src/test/sttEditDistance.test.ts`
- `src/test/lookupAssist.test.ts`
- `src/test/lookupAssistFlow.test.tsx`

Edited:
- `src/components/RawInputCollisionDialog.tsx` (add `groupKey`/`signalLabel`/`source:"lookup_assist"`, grouped rendering, single-select-per-group, lookup-assist title/subnote)
- `src/components/Pass1SectionPanel.tsx` (call `collectAssistCandidates` after `scanKnownLookups` for `playDetails`; route confirms through existing `applySystemPatch`)
- `src/test/rawInputCollisionDialog.test.tsx` (add grouped/single-select cases)

Untouched (verified explicitly):
- `src/engine/transaction.tsx`
- `src/engine/lookupScanner.ts`
- `src/engine/aiEnrichClient.ts` (no AI ranking in F2.a)
- `supabase/functions/ai-enrich/index.ts`
- Schema, Hudl export, Pass 2/3 surfaces.

## Create-new handling

**Deferred (Option A).** No "Create new" affordance in this dialog. Coach uses Skip → manual edit in the existing field grid; if the manually entered value is unknown, the existing lookup governance interrupt fires at Review/Commit. This avoids any hidden draft mutation that would route through governance later.

## Grouped single-select enforcement

Enforced inside `RawInputCollisionDialog`'s local `selected` state. Toggling a row whose `groupKey` is set first removes any other selected row sharing the same `groupKey`, then adds the new row. Rows without `groupKey` (legacy / AI-correction rows) keep multi-select behavior unchanged.

## Acceptance

- All new unit + dialog tests pass.
- Integration smoke test passes.
- Existing 718-test suite remains green (Slices A–F1 untouched).
- `transaction.tsx` and `lookupScanner.ts` diff is empty.
- F2.b AI ranking is not started.
