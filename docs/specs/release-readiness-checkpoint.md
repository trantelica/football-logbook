# Release Readiness Checkpoint

> Documentation-only snapshot. No code changes, feature work, parser expansion, AI implementation, or archive import work is included in this checkpoint.
> Created after acceptance of three-pass deterministic lifecycle and export / interoperability acceptance sweeps.

---

## 1. Acceptance Ledger

| Track | Status | Notes |
|---|---|---|
| Pass 1 (Situation + Play Details + Play Results) | Accepted | Deterministic acceptance complete. |
| Pass 2 / Personnel | Accepted | Personnel management, validation, and carry-forward accepted. |
| Pass 3 deterministic grading | Accepted | Grade field commits, overwrite review, bulk-empty commands accepted. |
| Three-pass deterministic lifecycle | Accepted | End-to-end `candidate → proposal → validate → commit → audit` accepted. |
| Hudl CSV export | Accepted | Frozen `HUDL_HEADERS`, committed-rows-only export, null → empty cell, no transient leakage. |
| Session archive export structure | Accepted | Pure `buildSessionArchive`, includes committed plays + lookups snapshot + schema snapshot + manifest. |
| Session archive import / true round-trip | Parked | Not yet implemented. Export structure is forward-compatible; import will need its own acceptance pass. |
| Pass 3 AI assist | Architecture approved, implementation deferred | Architecture slice reviewed and approved; no AI enrichment in Pass 3 deterministic path. |

---

## 2. Test Health Snapshot

- **Full suite baseline:** `897 / 897` passing.
- **Targeted export / interoperability tests:** `52 / 52` passing (`hudlExport.test.ts`, `sessionArchiveExport.test.ts`, `coerce.test.ts`, `seasonTransfer.test.ts`).
- **Pass 3 deterministic parser / bulk-command tests:** Covered in per-clause parser regression and `gradeBulkCommand.test.ts` / `gradeNarrationParser.test.ts` suites (all green).

No regressions introduced during acceptance sweeps.

---

## 3. Contract Snapshot

Current canonical values and locations (frozen unless a new defect is confirmed):

| Constant | Value | Location |
|---|---|---|
| `SCHEMA_VERSION` | `"2.1.0"` | `src/engine/schema.ts:8` |
| `APP_VERSION` | `"1.0.0"` | `src/engine/schema.ts:9` |
| `EXPORT_FORMAT_VERSION` | `"8.1.0"` | `src/engine/hudlExport.ts` |
| `SESSION_ARCHIVE_FORMAT_VERSION` | `"8.2.0"` | `src/engine/sessionArchiveExport.ts` |

### HUDL_HEADERS

Frozen array of `{ key, label }` objects. Source: `src/engine/hudlExport.ts`.

Keys in order:

`playNum`, `qtr`, `odk`, `series`, `yardLn`, `dn`, `dist`, `hash`, `offForm`, `offPlay`, `motion`, `result`, `gainLoss`, `twoMin`, `rusher`, `passer`, `receiver`, `penalty`, `penYards`, `eff`, `offStrength`, `personnel`, `playType`, `playDir`, `motionDir`, `posLT`, `posLG`, `posC`, `posRG`, `posRT`, `posX`, `posY`, `pos1`, `pos2`, `pos3`, `pos4`, `returner`, `gradeLT`, `gradeLG`, `gradeC`, `gradeRG`, `gradeRT`, `gradeX`, `gradeY`, `grade1`, `grade2`, `grade3`, `grade4`.

### NOTES_HEADERS

Frozen array of `{ key, label }` objects. Source: `src/engine/hudlExport.ts`.

Keys in order:

`gameId`, `playNum`, `noteId`, `createdAt`, `updatedAt`, `text`, `qtr`, `odk`, `yardLn`, `dn`, `dist`, `offForm`, `offStrength`, `offPlay`, `motion`, `result`, `gainLoss`.

### GRADE_FIELDS

`["gradeLT", "gradeLG", "gradeC", "gradeRG", "gradeRT", "gradeX", "gradeY", "grade1", "grade2", "grade3", "grade4"]`

Source: `src/engine/personnel.ts:10–13`.

### PERSONNEL_POSITIONS

`["posLT", "posLG", "posC", "posRG", "posRT", "posX", "posY", "pos1", "pos2", "pos3", "pos4"]`

Source: `src/engine/personnel.ts:28–31`.

### Section Ownership Map

Source: `src/engine/sectionOwnership.ts`.

| Section | Dictate Key | Owned Fields |
|---|---|---|
| `situation` | `S` | `qtr`, `odk`, `series`, `twoMin`, `patTry`, `dn`, `dist`, `yardLn`, `hash` |
| `playDetails` | `D` | `offForm`, `motion`, `offPlay` |
| `playResults` | `R` | `result`, `gainLoss`, `rusher`, `passer`, `receiver`, `penalty`, `penYards`, `eff` |

Derived fields (`offStrength`, `personnel`, `playType`, `playDir`, `motionDir`) are **not** owned by any section.

---

## 4. Accepted Behavioral Contracts

The following behaviors are accepted as of this checkpoint and are enforced by tests and/or UI guardrails:

1. **Strict transaction lifecycle:** `candidate → proposal → validate → commit → audit`. No silent commit. No silent overwrite.
2. **Committed rows immutable** unless changed through a defined review / overwrite path (`OverwriteReview`, `GradeOverwriteDialog`, `PossessionCheckDialog`, `TDCorrectionDialog`).
3. **Pass ownership enforced:** Sections may only write to their owned fields. Derived fields populate downstream from governed parent values.
4. **Pass 2 carry-forward rules:** Immediate-prior-only, Pass-2-only, personnel-only, candidate/proposal-only. No cascading forward to already-committed slots.
5. **Pass 3 deterministic parser accepted:** Per-clause parser regression covered; bulk-empty command covered. No AI assist currently active in Pass 3.
6. **Export uses committed rows only:** `getPlaysByGame()` reads the `plays` IndexedDB store, which is populated exclusively via `commitProposal` and `commitGradeFields`.
7. **Empty / uncommitted scaffolded slots do not export:** Scaffolded slots live in `slot_meta` store; they never leak into `plays` or CSV output.
8. **Candidate / proposal / transient state does not export:** No proposal-only or candidate-only values appear in Hudl CSV or session archive.
9. **Null handling in export:** `null` / `undefined` values render as empty cells, never as the strings `"null"` or `"undefined"`.

---

## 5. Parked Work

The following items are intentionally deferred and tracked for future planning:

| Item | Status | Blocker / Reason |
|---|---|---|
| Session archive import / true archive round-trip | Parked | Not implemented. Export structure is stable and forward-compatible. |
| Pass 3 AI assist implementation | Parked | Architecture approved; deferred until deterministic baseline is stable. |
| Broader UX polish sweep | Parked | Out of scope for deterministic acceptance phase. |
| `lookupStoreVersion` true manifest stamping | Parked | Currently hard-coded as `"unknown"` in `StatusBar.tsx`; low priority. |

---

## 6. Next-Track Options

No recommendation is made here. The following tracks are available for the next planning cycle:

- **Archive import** — Implement `importSessionArchive` consumer and run a true round-trip acceptance pass.
- **Pass 3 AI assist** — Implement the approved architecture slice for AI enrichment in Pass 3 grading.
- **UX polish sweep** — Instrument-like aesthetic refinements, mobile responsiveness, or workflow friction reduction.
- **Documentation / spec refresh** — Update `canonical-data-contract.md`, `multi-pass-workflow.md`, or other specs to reflect accepted state.

---

*Last updated: after Export / Interoperability acceptance sweep (full suite 897/897, export tests 52/52).*
