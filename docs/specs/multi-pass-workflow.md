# Football Engine — Multi-Pass Workflow Spec

**Version:** v2.0 draft  
**Status:** Working spec  
**Primary purpose:** define what each logging pass owns, what it must preserve, and how each pass interacts with the deterministic transaction engine.  
**Canonical owner:** product owner / coach  
**Implementation owner:** Lovable / code implementation agents  
**Repo path:** `docs/specs/multi-pass-workflow.md`

---

## 1. Conclusion

The Football Engine uses multiple workflow passes over the same committed play row.

Passes are not separate data models. They are focused editing workspaces that narrow the active field set while preserving all committed data outside the pass.

Every pass must use the same architecture:

```text
candidate → proposal → validate → commit → audit
```

No pass may silently mutate committed data. No pass may clear unrelated fields. No pass may bypass the canonical data contract.

---

## 2. Core Rule

A pass defines **workflow focus**, not schema ownership.

The committed play row remains the canonical unit of storage and export.

```text
One play slot → one committed play row → many possible workflow passes
```

Each pass may touch only its active field group unless the coach explicitly edits additional context through a governed overwrite flow.

---

## 3. Pass Summary

| Pass | Name | Status | Primary Purpose |
|---:|---|---|---|
| 0 | Game Initialization / Slot Scaffold | Active / foundational | create play slots and scaffold required context |
| 1 | Basic Play Logging | Active | capture core play metadata |
| 2 | Personnel Assignment | Active | assign offensive personnel slots |
| 3 | Blocking / Grading | Active | grade offensive personnel |
| 4 | Defensive Metadata on Offensive Plays | Future / inactive | tag defensive front/coverage/blitz/gap |
| 5 | Kicking / Special Teams | Future / inactive | kicking/special teams workflow |
| 6+ | Defensive Play Logging | Future / inactive | full defensive possession logging |

Current implementation maturity is centered on Passes 0 through 3.

---

## 4. Universal Pass Rules

Every active pass must obey these rules.

### 4.1 Proposal Discipline

1. Coach input creates candidate values.
2. Candidate values normalize into a proposal patch.
3. Proposal values are visible before commit.
4. The coach explicitly accepts, corrects, pauses, or discards.
5. Only an accepted valid proposal may commit.

### 4.2 Preservation Discipline

A pass must preserve committed data outside its field scope.

Example:

- Pass 2 personnel work must not overwrite `offPlay`, `offForm`, `result`, or `gainLoss`.
- Pass 3 grading work must not overwrite Pass 1 play metadata or Pass 2 personnel unless explicitly touched and confirmed.

### 4.3 Touched-Field Discipline

Only fields touched by the current interaction should be included in overwrite review.

Untouched committed fields are carried forward into the committed snapshot unchanged.

### 4.4 Overwrite Discipline

If a proposal changes a non-null committed value, the system must show before/after review and require explicit confirmation.

### 4.5 Provenance Discipline

Proposal values should indicate their origin where useful:

- coach
- parser
- AI
- lookup
- prediction
- carryForward
- manualOverride
- system

### 4.6 Export Discipline

Passes write to the same committed row that feeds the Hudl export adapter.

No pass may create an alternate export shape.

---

## 5. Pass 0 — Game Initialization / Slot Scaffold

### 5.1 Purpose

Pass 0 creates the structural foundation for a logging session.

It ensures the system has play slots before the coach begins detailed logging.

### 5.2 Primary Fields

| Field | Export Label | Notes |
|---|---|---|
| `playNum` | `PLAY #` | immutable slot identity |
| `qtr` | `QTR` | initialized or scaffolded |
| `odk` | `ODK` | O, D, K, or S |
| `series` | `SERIES` | scaffolded / logic-derived |

### 5.3 Rules

1. `playNum` is slot identity and should not be casually editable.
2. `qtr` and `odk` may be scaffolded from game setup.
3. `series` may be derived from O/D/K blocks.
4. Pass 0 setup must not create hidden play metadata values.
5. Editing scaffold drivers after logging begins may warn about downstream inconsistency.
6. The system must not silently rewrite already committed downstream plays.

### 5.4 Segment Rows

`ODK = S` indicates a film artifact or segment row used for indexing, not a true analytic football play.

Segment rows may have reduced required fields:

```text
playNum, qtr, odk
```

---

## 6. Pass 1 — Basic Play Logging

### 6.1 Purpose

Pass 1 captures core offensive play metadata efficiently and deterministically.

The coach may enter the play through:

1. structured manual fields
2. typed narration
3. voice narration
4. guided session narration

Regardless of input method, the output must be a reviewable proposal.

### 6.2 Primary Fields

| Field | Export Label | Role |
|---|---|---|
| `yardLn` | `YARD LN` | starting field position |
| `dn` | `DN` | down |
| `dist` | `DIST` | distance |
| `hash` | `HASH` | ball location |
| `offForm` | `OFF FORM` | governed formation |
| `offPlay` | `OFF PLAY` | governed play call |
| `motion` | `MOTION` | governed motion |
| `result` | `RESULT` | play result |
| `gainLoss` | `GN/LS` | gain/loss |
| `twoMin` | `2 MIN` | situational marker |
| `rusher` | `RUSHER` | ball carrier/rusher |
| `passer` | `PASSER` | passer |
| `receiver` | `RECEIVER` | receiver |
| `penalty` | `PENALTY` | penalty |
| `penYards` | `PEN YARDS` | penalty yards |
| `eff` | `EFF` | efficient play marker |
| `offStrength` | `OFF STR` | lookup-derived |
| `personnel` | `PERSONNEL` | lookup-derived |
| `playType` | `PLAY TYPE` | lookup-derived |
| `playDir` | `PLAY DIR` | lookup-derived |
| `motionDir` | `MOTION DIR` | lookup-derived |

### 6.3 Lookup-Governed Fields

Pass 1 lookup-governed values include:

- `offForm`
- `offPlay`
- `motion`

Dependent lookup fields include:

- `offStrength`
- `personnel`
- `playType`
- `playDir`
- `motionDir`

Unknown governed values must trigger lookup governance before commit.

### 6.4 Prediction Fields

Pass 1 may use deterministic prediction defaults for:

- `yardLn`
- `dn`
- `dist`
- `eff`
- `penYards`

Prediction values are proposal defaults only.

### 6.5 Pass 1 Commit & Next

Commit & Next should:

1. validate the current proposal
2. commit only after explicit coach action
3. audit material changes
4. advance to the next slot
5. seed only proposal defaults for the next slot
6. preserve committed rows

### 6.6 Pass 1 Guardrails

Pass 1 must not:

1. silently append unknown lookup values
2. silently commit parser or AI output
3. silently infer actors where ambiguous
4. mutate Pass 2 personnel
5. mutate Pass 3 grades
6. cascade prediction edits into later committed plays

---

## 7. Pass 2 — Personnel Assignment

### 7.1 Purpose

Pass 2 is a personnel assignment workspace.

It is not a second Pass 1 parser.

Pass 2 exists to assign the eleven offensive personnel slots for a committed or scaffolded play.

### 7.2 Canonical Personnel Slots

The canonical Pass 2 slots are:

```text
LT, LG, C, RG, RT, Y, X, 1, 2, 3, 4
```

### 7.3 Internal Key Mapping

| Canonical Slot | Internal Key | Export Label |
|---|---|---|
| LT | `posLT` | `LT` |
| LG | `posLG` | `LG` |
| C | `posC` | `C` |
| RG | `posRG` | `RG` |
| RT | `posRT` | `RT` |
| Y | `posY` | `Y` |
| X | `posX` | `X` |
| 1 | `pos1` | `1` |
| 2 | `pos2` | `2` |
| 3 | `pos3` | `3` |
| 4 | `pos4` | `4` |

### 7.4 Alias Rule

Aliases may help the coach speak or view personnel in team language.

Aliases must not change:

1. internal keys
2. committed row keys
3. proposal patch keys
4. export labels
5. audit field names

Example:

```text
Display alias Z → canonical slot 1 → internal key pos1 → export label 1
```

### 7.5 Pass 2 Seeding Rule

When an empty Pass 2 slot is opened, it should seed from the most recent prior committed offensive play with complete personnel.

Rules:

1. Seeding occurs into proposal/candidate state only.
2. Seeding is visible before commit.
3. Seeding must not overwrite already committed personnel.
4. Seed-on-open and Commit & Next should use the same policy.
5. The coach must explicitly commit seeded personnel before it becomes committed data.

### 7.6 Roster and Off-Roster Handling

Pass 2 should validate roster membership where roster governance is active.

Rules:

1. Off-roster jerseys may be detected.
2. The off-roster resolution flow must preserve assignment context.
3. Adding a jersey/player to the roster must not erase the intended slot assignment.
4. Roster additions must not rewrite historical committed plays silently.
5. After off-roster resolution, the proposal should still show the intended personnel assignment.

### 7.7 Duplicate Detection

Pass 2 should detect duplicate jersey assignments across the eleven active offensive slots.

Duplicate detection should be field-specific and actionable.

### 7.8 Actor Membership

Where actor membership validation is active, Pass 1 actor fields should be checked against Pass 2 personnel.

Examples:

- `rusher` should appear in offensive personnel for offensive plays where applicable.
- `passer` should appear in offensive personnel for offensive pass plays where applicable.
- `receiver` should appear in offensive personnel for offensive pass plays where applicable.

Actor membership issues should warn or block according to the active validation policy.

### 7.9 Pass 2 Guardrails

Pass 2 must not:

1. reinterpret basic play narration as Pass 1 data by default
2. overwrite Pass 1 fields unless explicitly touched
3. use aliases as stored canonical fields
4. silently commit carry-forward values
5. silently overwrite committed personnel
6. lose assignment context during off-roster resolution

---

## 8. Pass 3 — Blocking / Grading

### 8.1 Purpose

Pass 3 captures blocking grades for offensive personnel.

It is a grading workspace, not a general play editing workspace.

### 8.2 Primary Grade Fields

| Slot | Internal Grade Key | Export Label |
|---|---|---|
| LT | `gradeLT` | `LT GRADE` |
| LG | `gradeLG` | `LG GRADE` |
| C | `gradeC` | `C GRADE` |
| RG | `gradeRG` | `RG GRADE` |
| RT | `gradeRT` | `RT GRADE` |
| X | `gradeX` | `X GRADE` |
| Y | `gradeY` | `Y GRADE` |
| 1 | `grade1` | `1 GRADE` |
| 2 | `grade2` | `2 GRADE` |
| 3 | `grade3` | `3 GRADE` |
| 4 | `grade4` | `4 GRADE` |

### 8.3 Allowed Grade Values

```text
-3, -2, -1, 0, 1, 2, 3
```

### 8.4 Dictation / Narration Behavior

Pass 3 may accept grade narration.

Examples:

```text
LT plus one, LG zero, Y minus one
```

Collapsed tokens should be handled carefully:

```text
Y1 → gradeY = 1
```

Pass 3 parser behavior must distinguish:

- canonical slot `Y`
- canonical slot `1`
- grade value `1`

### 8.5 Common Speech Normalization

The phrase `go to` may be a speech-to-text mis-transcription of `got a` in grading narration.

Example:

```text
Y go to one
```

May need to normalize as:

```text
Y got a one → gradeY = 1
```

This should be handled as parser/narration normalization, not schema change.

### 8.6 Manual and Narrated Grade Changes

Both manual grade edits and narrated grade edits must go through the same proposal and commit path.

There must not be one pathway for dictation and another unsafe pathway for manual edit.

### 8.7 Pass 3 Stability Principle

Pass 3 is functional and should not be refined endlessly unless a regression appears.

Future Pass 3 changes should be:

1. small
2. targeted
3. regression-tested
4. limited to grading workflow unless explicitly approved

### 8.8 Pass 3 Guardrails

Pass 3 must not:

1. overwrite Pass 1 play metadata by default
2. overwrite Pass 2 personnel by default
3. treat `Y1` as personnel slot 1 without context
4. commit grade narration without proposal review
5. accept out-of-range grades
6. create new schema fields for temporary parser artifacts

---

## 9. Future Pass 4 — Defensive Metadata on Offensive Plays

### 9.1 Status

Future / inactive.

### 9.2 Candidate Fields

Original PDR candidate fields include:

- `defFront`
- `coverage`
- `blitz`
- `gap`

### 9.3 Activation Rule

Do not add Pass 4 fields to the active Hudl export until:

1. schema revision is approved
2. lookup governance is defined
3. validation rules are defined
4. workflow UX is defined
5. acceptance tests exist

---

## 10. Future Pass 5 — Kicking / Special Teams

### 10.1 Status

Future / inactive.

### 10.2 Candidate Fields

Original PDR candidate fields include:

- `kicker`
- `returner`
- `retYards`

Current export already includes `returner`. Treat it as present but not fully mature as a kicking workflow field.

### 10.3 Activation Rule

Do not expand kicking export behavior until the workflow is explicitly specified and tested.

---

## 11. Future Pass 6+ — Defensive Play Logging

Full defensive play logging is future scope.

It must use the same deterministic architecture if activated:

```text
candidate → proposal → validate → commit → audit
```

Defense must not be layered on as a separate unsafe system.

---

## 12. Cross-Pass Context Header

Each pass should show stable play context so the coach knows where they are.

Recommended always-visible context:

- active play number
- quarter
- ODK
- down
- distance
- yard line
- formation
- play
- result, where useful

The context header is a reference surface, not an invitation to mutate unrelated fields.

---

## 13. Cross-Pass Overwrite Behavior

If a pass allows editing a field outside its normal scope, the edit must be explicit.

Example:

In Pass 2, if the coach changes `offForm`, the system must treat that as a Pass 1 field overwrite and apply overwrite governance.

Default behavior should discourage cross-pass edits unless there is a clear workflow reason.

---

## 14. Review / Commit Controls by Pass

Each active pass should support the same basic controls:

1. review proposal
2. commit
3. commit and next, where appropriate
4. discard proposal
5. pause / leave slot

Pass-specific labels may vary, but the underlying transaction model must remain identical.

---

## 15. Implementation Guardrails for Lovable

### 15.1 Good Request Pattern

```text
Inspect the current Pass 2 flow only.
Confirm whether seed-on-open and Commit & Next use the same carry-forward source and whether seeded values remain proposal-only until commit.
Do not modify code.
Do not inspect unrelated parser behavior.
```

### 15.2 Good Patch Pattern

```text
Make the smallest targeted patch to Pass 2 seeding.
Ensure empty Pass 2 slots seed from the most recent prior committed offensive play with complete personnel.
Do not overwrite committed personnel.
Do not touch Pass 1 parser behavior.
Do not change Hudl export headers.
Add or update a focused regression test if a test surface exists.
```

### 15.3 Bad Request Pattern

```text
Clean up the multi-pass workflow and make it more intuitive.
```

That request is too broad and likely to burn credits.

---

## 16. Acceptance Criteria

### 16.1 Universal Pass Acceptance

The system passes if:

1. each pass loads the active play slot correctly
2. each pass preserves unrelated committed fields
3. each pass writes through proposal/validate/commit
4. overwrite review triggers for touched non-null committed fields
5. commit audit exists for material changes
6. export shape remains unchanged after pass commits

### 16.2 Pass 1 Acceptance

Pass 1 passes if:

1. basic play metadata can be proposed and committed
2. known lookup values normalize to canonical values
3. unknown governed values trigger lookup governance
4. actor phrases can map to actor fields where explicit
5. predicted values remain visible proposal defaults
6. Commit & Next advances to the next slot without silent downstream mutation

### 16.3 Pass 2 Acceptance

Pass 2 passes if:

1. canonical slots are LT, LG, C, RG, RT, Y, X, 1, 2, 3, 4
2. aliases remain display/translation only
3. empty slots seed from prior complete committed offensive personnel
4. committed personnel are not overwritten by seeding
5. duplicate jerseys are detected
6. off-roster resolution preserves assignment context
7. Pass 2 does not behave like a second Pass 1 parser

### 16.4 Pass 3 Acceptance

Pass 3 passes if:

1. grading panel appears only in Pass 3
2. manual grade edits and narrated grade edits both enter proposal review
3. grade values are constrained to -3..3
4. collapsed tokens like `Y1` are handled correctly
5. Pass 3 does not mutate Pass 1 or Pass 2 fields unless explicitly touched and confirmed
6. provenance indicators remain visible where useful

---

## 17. Open Issues / Review Items

| ID | Issue | Recommendation |
|---|---|---|
| MP-001 | Confirm Pass 2 seed-on-open and Commit & Next share the same seeding policy | Inspect implementation before patching |
| MP-002 | Confirm off-roster resolution preserves assignment context after roster add | Keep as Pass 2 regression case |
| MP-003 | Confirm Pass 3 manual and narrated grade changes use same commit path | Keep as Pass 3 regression case |
| MP-004 | Decide whether cross-pass editing should be disabled, discouraged, or allowed with gates | Defer until UX spec |
| MP-005 | Determine future activation path for Pass 4 defensive metadata | Parking lot |
| MP-006 | Determine future activation path for Pass 5 special teams | Parking lot |

---

## 18. Final Operating Rule

A pass is a narrow lens, not a separate universe.

The coach should feel focused. The data should remain whole.
