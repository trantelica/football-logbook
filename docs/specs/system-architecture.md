# Football Engine — System Architecture Spec

**Version:** v2.0 draft  
**Status:** Working spec  
**Primary purpose:** preserve deterministic system behavior while allowing implementation to evolve.  
**Canonical owner:** product owner / coach  
**Implementation owner:** Lovable / code implementation agents  
**Repo path:** `docs/specs/system-architecture.md`

---

## 1. Conclusion

The Football Engine is a deterministic local-first film logging system. The architecture must protect the committed play log from silent mutation while allowing coach-friendly workflows, lookup governance, prediction defaults, carry-forward defaults, and AI-assisted narration.

The governing architecture is:

```text
candidate → proposal → validate → commit → audit
```

Export is downstream of committed rows:

```text
committed rows → canonical export adapter → Hudl Plays CSV
```

The deterministic engine is authoritative. AI is advisory only.

---

## 2. Architectural Non-Negotiables

The following are not implementation preferences. They are product architecture constraints.

1. No silent commit.
2. No silent mutation of committed data.
3. No downstream cascade rewrites of committed plays.
4. Prediction values are visible proposal defaults only.
5. Carry-forward values are visible proposal defaults only.
6. Lookup-derived values are visible proposal defaults only.
7. AI may assist candidate generation but must not validate or commit.
8. The proposal is the authoritative review surface.
9. Canonical schema and export shape are governed separately from internal implementation keys.
10. Every commit must pass deterministic validation.
11. Every overwrite must be scoped, visible, and intentional.
12. Audit events must capture material state changes.

---

## 3. System Layer Model

The system is organized into six logical layers.

```text
[Input Layer]
     ↓
[Candidate Layer]
     ↓
[Governance + Normalization Layer]
     ↓
[Proposal Layer]
     ↓
[Validation + Commit Engine]
     ↓
[Persistence + Export Layer]
```

AI, when used, lives beside the candidate layer and may only assist candidate formation.

```text
[AI Assistance Layer] → candidate evidence / candidate patch only
```

AI does not own committed state.

---

## 4. Layer Responsibilities

### 4.1 Input Layer

Accepts coach input from:

1. manual form edits
2. typed narration
3. voice transcript
4. guided-session responses
5. direct lookup/reference maintenance workflows

The input layer does not commit data.

### 4.2 Candidate Layer

Converts raw input into candidate evidence and tentative field changes.

Examples:

- transcript text
- parsed down/distance
- possible formation
- possible play call
- possible actor jersey
- possible grade token
- manually edited field value

Candidate data is not committed data.

### 4.3 Governance + Normalization Layer

Normalizes candidate values through deterministic rules and reference governance.

Responsibilities:

1. lookup matching
2. synonym matching
3. dependent field resolution
4. roster/off-roster evaluation
5. enum normalization
6. parser safety checks
7. ambiguity detection

This layer may produce normalized proposal values, but it must not mutate committed rows.

### 4.4 Proposal Layer

The proposal is the reviewable draft state for the active play and active workflow pass.

The proposal may include:

1. coach-entered values
2. parser-derived values
3. AI-assisted values
4. lookup-derived values
5. predicted defaults
6. carry-forward defaults
7. validation warnings
8. provenance indicators
9. touched-field metadata

The proposal is the cockpit. The coach must see and accept it before commit.

### 4.5 Validation + Commit Engine

The commit engine is the only layer that may write to committed play rows.

Responsibilities:

1. validate proposal shape
2. validate active pass rules
3. validate required fields
4. validate allowed values
5. validate lookup-governed fields
6. validate roster/personnel constraints
7. detect overwrite risk
8. require explicit overwrite confirmation when needed
9. create committed snapshot
10. create audit event

### 4.6 Persistence + Export Layer

Persists committed rows, lookup stores, configuration, notes, and audit events.

Exports committed rows through the governed export adapter.

The export layer must not infer, backfill, mutate, or re-derive committed play values during export.

---

## 5. Canonical Transaction Flow

### 5.1 Standard New Commit Flow

```text
1. Load active play slot
2. Load committed row snapshot, if any
3. Load seeded / carried context
4. Accept coach input
5. Build candidate
6. Normalize governed values
7. Build proposal patch
8. Track touched fields and provenance
9. Validate proposal
10. Present proposal to coach
11. Coach accepts, corrects, pauses, or discards
12. On accept, commit engine writes committed snapshot
13. Audit event is created
14. UI advances or remains based on workflow action
```

### 5.2 Edit Existing Commit Flow

```text
1. Load committed row snapshot
2. Accept proposed edits
3. Build proposal patch for touched fields only
4. Compare touched fields against committed snapshot
5. Show before/after overwrite review if non-null committed values change
6. Require explicit confirmation
7. Commit updated snapshot only after confirmation
8. Audit overwrite event
```

### 5.3 Rejected Proposal Flow

If the coach rejects or discards a proposal:

1. committed row remains unchanged
2. lookup store remains unchanged unless a separate lookup append was explicitly confirmed
3. audit may record the discarded proposal only if the product later chooses to track discarded drafts
4. UI returns to editable proposal or empty state

---

## 6. State Model

### 6.1 Committed Row State

Committed rows are durable snapshots. They represent accepted coach-reviewed values.

Committed rows must not be mutated by:

1. parser updates
2. AI outputs
3. prediction recalculation
4. carry-forward updates
5. lookup synonym edits
6. roster maintenance
7. UI alias changes
8. export formatting

Committed rows may be changed only through an explicit proposal/validation/commit transaction.

### 6.2 Proposal State

Proposal state is mutable and reviewable.

It may contain:

- patch values
- provenance tags
- warnings
- validation errors
- touched-field metadata
- seeded defaults
- prediction defaults
- carry-forward defaults

Proposal state may be abandoned without touching committed state.

### 6.3 Candidate State

Candidate state is pre-proposal evidence. It may be incomplete, ambiguous, or wrong.

Candidate state must not export.

### 6.4 Lookup State

Lookup stores are governed reference data. Lookup append workflows mutate lookup state only after explicit confirmation.

Lookup changes must not retroactively rewrite committed rows.

### 6.5 Roster State

Roster state governs jersey/player reference integrity.

Roster changes apply forward unless an explicit back-apply workflow is designed and audited.

Roster changes must not rewrite historical committed rows silently.

### 6.6 Configuration State

Configuration may govern field size, active workflow fields, and other product behavior.

Configuration changes must not rewrite historical committed rows silently.

---

## 7. Proposal Patch Model

A proposal patch is a scoped set of intended field updates.

Conceptual shape:

```ts
type ProposalPatch = Partial<PlayRecord>;
```

Required metadata around a proposal patch:

```ts
type ProposalEnvelope = {
  playNum: number;
  pass: WorkflowPass;
  patch: Partial<PlayRecord>;
  touchedFields: FieldKey[];
  provenanceByField: Record<FieldKey, ProvenanceTag>;
  validation: ValidationResult;
  overwriteReview?: OverwriteReview;
};
```

The exact implementation shape may vary, but these concepts must remain present.

---

## 8. Touched-Fields Discipline

Touched fields are fields introduced or changed by the current interaction.

Touched-field tracking protects against patch chaos.

Rules:

1. Validation should focus on fields in the active pass plus required cross-pass context.
2. Overwrite review should apply to touched fields only.
3. Non-touched committed fields must be preserved.
4. A pass should not accidentally clear unrelated committed fields.
5. Proposal review should make touched fields visually clear.

Example:

A Pass 3 grade narration that updates `gradeLT` and `gradeY` must not modify `offPlay`, `offForm`, personnel slots, or result fields unless the coach explicitly touches them.

---

## 9. Provenance Model

Each proposal value should be attributable.

Recommended provenance tags:

| Tag | Meaning |
|---|---|
| `coach` | directly entered by coach |
| `parser` | extracted by deterministic parser |
| `ai` | suggested by AI-assisted interpretation |
| `lookup` | derived from governed lookup reference |
| `prediction` | calculated as a visible default |
| `carryForward` | copied forward as a visible default |
| `manualOverride` | coach changed an existing proposed/default value |
| `system` | scaffolded by deterministic system setup |

Provenance tags are review aids. They do not override validation.

---

## 10. Validation Model

Validation must be deterministic.

Validation categories:

1. schema validation
2. required field validation
3. allowed value validation
4. lookup governance validation
5. roster reference validation
6. personnel duplicate validation
7. actor membership validation
8. grade range validation
9. pass-scope validation
10. overwrite validation
11. export readiness validation

Validation must produce field-specific, actionable messages.

---

## 11. Commit Model

Commit is the only write path to the play log.

Commit must:

1. take a valid proposal
2. apply the proposal patch to the prior committed snapshot or empty slot
3. preserve non-touched committed fields
4. create a new committed snapshot
5. create audit metadata
6. clear or advance proposal state

Commit must not:

1. infer missing values silently
2. apply hidden parser output
3. apply hidden AI output
4. perform downstream recalculation
5. mutate unrelated plays
6. alter lookup stores unless a separate lookup transaction has completed

---

## 12. Audit Model

Audit events should exist for material state changes.

Required audit event families:

| Event Family | Trigger |
|---|---|
| `PLAY_COMMIT` | new committed row |
| `PLAY_OVERWRITE` | committed field changed |
| `LOOKUP_APPEND_CONFIRMED` | new lookup value added |
| `ROSTER_ADD` | roster player added |
| `ROSTER_RESOLUTION` | off-roster jersey resolved |
| `CONFIG_CHANGE` | configuration changed |
| `EXPORT_CREATED` | optional export event |

Audit should answer:

1. what changed?
2. when did it change?
3. which play or reference record was affected?
4. what was the previous value?
5. what is the new value?
6. what workflow caused the change?

Audit is not a UI ornament. It is a trust ledger.

---

## 13. Prediction Architecture

Prediction is deterministic assistance.

Prediction may calculate likely defaults for the active proposal based on prior committed plays and current play outcomes.

Rules:

1. Prediction applies only to proposal state.
2. Prediction never writes directly to committed rows.
3. Prediction is always reviewable and overridable.
4. Prediction must preserve provenance.
5. Prediction must not cascade through previously committed rows.
6. Editing an upstream play may warn the coach but must not rewrite downstream plays silently.

Common prediction fields:

- `dn`
- `dist`
- `yardLn`
- `eff`
- `penYards`

Prediction maturity should expand progressively. It should not outrun test coverage.

---

## 14. Carry-Forward Architecture

Carry-forward copies prior committed context into the current proposal as a default.

Rules:

1. Carry-forward values are proposal defaults only.
2. Carry-forward values must remain visible before commit.
3. Carry-forward must not overwrite committed values.
4. Carry-forward must not fill unrelated active pass fields.
5. Carry-forward should identify its source play where useful.

Primary current use:

```text
Pass 2 personnel seeding from most recent prior committed offensive play with complete personnel.
```

Seed-on-open and Commit & Next should follow the same carry-forward policy.

---

## 15. Lookup Governance Architecture

Lookup governance sits between candidate parsing and proposal validation.

Lookup governance responsibilities:

1. match known canonical values
2. match approved synonyms
3. detect unknown governed values
4. block proposal validation when required
5. collect dependent fields for new canonical values
6. persist confirmed lookup entries
7. version and audit lookup changes
8. rerun normalization after append

Lookup governance must not:

1. write directly to committed play rows
2. silently create canonical values
3. let raw unknown values enter committed rows
4. change historical rows after lookup maintenance

---

## 16. Roster and Off-Roster Architecture

Roster governance protects player identity and personnel integrity.

Rules:

1. Personnel slots store jersey numbers.
2. Roster may map jersey numbers to player names.
3. Off-roster jerseys may be detected during personnel assignment.
4. Off-roster resolution must preserve assignment context.
5. Adding a roster player must not rewrite historical committed rows silently.
6. Actor fields should be validated against personnel where the workflow requires actor membership.

Current canonical personnel slots:

```text
LT, LG, C, RG, RT, Y, X, 1, 2, 3, 4
```

Aliases are display/translation only.

---

## 17. Multi-Pass Architecture

Passes are workflow filters over the same committed play row.

They are not separate row models.

| Pass | Purpose | Primary Fields |
|---:|---|---|
| 0 | Game initialization / slot scaffold | play number, quarter, ODK, series |
| 1 | Basic play metadata | down, distance, formation, play, result, actors |
| 2 | Personnel assignment | offensive personnel slots |
| 3 | Blocking / grading | grade fields |
| 4 | Defensive metadata on offensive plays | future/inactive |
| 5 | Kicking / special teams | future/inactive |
| 6+ | Defensive play logging | future/inactive |

Pass rules:

1. A pass narrows the editable field set.
2. A pass must preserve data outside its field set.
3. Pass-specific proposals still use the same commit engine.
4. Pass 2 is a personnel workspace, not a second Pass 1 parser.
5. Pass 3 is a grading workflow and should not trigger broad play metadata edits.

---

## 18. AI Assistance Architecture

AI is optional, modular, and replaceable.

AI may:

1. interpret messy coach narration
2. suggest candidate evidence
3. suggest candidate patches
4. identify ambiguity
5. suggest missing fields
6. help map natural phrasing to governed concepts

AI must not:

1. mutate committed rows
2. bypass lookup governance
3. bypass validation
4. bypass proposal review
5. silently select among ambiguous values
6. directly write export fields
7. become the source of schema truth

The deterministic engine remains authoritative.

---

## 19. Guided Session Architecture

North-star interaction:

```text
Coach speaks naturally.
System assembles proposal silently.
Coach reviews proposal explicitly.
System never commits silently.
```

Guided-session architecture should hide internal complexity from the coach while preserving inspectability.

The coach should experience:

1. orientation
2. natural narration
3. coach-friendly proposal
4. accept / correct / pause / restart
5. advance with updated context

The system may internally perform parsing, lookup normalization, AI assistance, and validation. Those stages should normally collapse into one reviewable proposal.

---

## 20. Export Architecture

Export operates only on committed rows.

Export must:

1. use the frozen Hudl header contract
2. preserve header order
3. sort rows by `playNum`
4. serialize null/undefined as empty cells
5. escape CSV values correctly
6. avoid deriving new values during export
7. avoid changing committed rows

Export must not dynamically derive headers from loose schema metadata if that metadata can drift from the Hudl contract.

---

## 21. Persistence Architecture

The system is local-first.

Persistence surfaces may include:

1. committed session rows
2. lookup stores
3. roster store
4. configuration
5. notes
6. audit events
7. session metadata

Persistence rules:

1. committed rows are durable snapshots
2. lookup stores are versioned independently
3. roster changes do not rewrite historical rows
4. configuration changes do not rewrite historical rows
5. exports are generated from committed rows, not draft/proposal state

---

## 22. Error Handling Principles

Error handling should be deterministic, specific, and actionable.

Errors should identify:

1. affected field
2. invalid value
3. expected value/rule
4. correction path

Errors should not:

1. silently repair committed data
2. hide schema violations
3. overuse blocking modals for minor issues
4. blame the coach
5. invent values to resolve ambiguity

---

## 23. Implementation Guardrails for Lovable

### 23.1 Good Request Pattern

```text
Inspect the current transaction flow and report where proposal state becomes committed state.
Do not modify code.
Identify any place where prediction, carry-forward, parser output, or AI output can mutate committed rows without explicit commit.
```

### 23.2 Bad Request Pattern

```text
Refactor the architecture to be cleaner.
```

That request is too broad and risks credit burn and accidental regressions.

### 23.3 Patch Request Pattern

When code changes are needed:

```text
Make the smallest targeted patch.
Do not alter export headers.
Do not rename canonical fields.
Do not change unrelated workflows.
Preserve candidate → proposal → validate → commit → audit.
Add or update tests for the specific behavior touched.
```

---

## 24. Acceptance Criteria

The architecture is conforming when:

1. a coach can create or edit a play only through proposal review and explicit commit
2. prediction values are visible before commit
3. carry-forward values are visible before commit
4. lookup-derived values are visible before commit
5. committed rows are not silently rewritten
6. editing an earlier play does not silently recalculate later committed plays
7. Pass 2 does not overwrite Pass 1 fields unintentionally
8. Pass 3 does not overwrite Pass 1 or Pass 2 fields unintentionally
9. export uses committed rows only
10. AI can be disabled without breaking core logging
11. lookup governance can block unknown governed values before commit
12. off-roster resolution preserves assignment context
13. audit events exist for committed material changes

---

## 25. Open Issues / Review Items

| ID | Issue | Recommendation |
|---|---|---|
| ARCH-001 | Need confirm current audit event coverage across overwrite, lookup append, roster resolution, and config changes | Inspect before broad patching |
| ARCH-002 | Need confirm proposal patch shape and touched-field tracking are consistent across passes | Inspect before broad patching |
| ARCH-003 | Need confirm carry-forward seed-on-open and Commit & Next share same policy | Already observed as a product requirement; inspect implementation |
| ARCH-004 | Need confirm export reads committed rows only | Treat as critical invariant |
| ARCH-005 | Need confirm AI/parser outputs cannot directly mutate committed rows | Critical before deeper guided-session work |

---

## 26. Final Operating Rule

The architecture should make the correct path easy and the dangerous path impossible.

Coach-friendly can still be deterministic. Fast can still be inspectable. Helpful can still ask permission before touching the ledger.
