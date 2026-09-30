# Football Engine — Pass 1 Basic Logging & Dictation Spec

**Version:** v2.0 draft  
**Status:** Working spec  
**Primary purpose:** define Pass 1 section scope, basic play logging behavior, dictation behavior, and proposal/commit boundaries for core play metadata.  
**Canonical owner:** product owner / coach  
**Implementation owner:** Lovable / code implementation agents  
**Repo path:** `docs/specs/pass1-basic-logging-and-dictation.md`

---

## 1. Conclusion

Pass 1 is the core offensive play logging workspace.

It captures basic play metadata, governed playbook values, outcomes, actors, and lookup-derived context. It is not a personnel assignment workspace and not a grading workspace.

Pass 1 dictation may help create a proposal, but it must not commit or overwrite silently.

The governing flow is:

```text
manual entry / dictation / typed narration → candidate → governed proposal → validate → review → commit → audit
```

---

## 2. Scope

This spec governs:

1. Pass 1 owned field set
2. Pass 1 section behavior
3. manual field entry
4. typed narration
5. voice dictation/transcript behavior
6. parser output routing
7. lookup interrupt behavior in Pass 1
8. prediction defaults shown in Pass 1
9. actor extraction
10. proposal review and commit behavior
11. Commit & Next behavior
12. cross-pass protection
13. acceptance tests

This spec does not govern:

1. Pass 2 personnel assignment
2. Pass 3 grade parsing
3. Hudl export headers
4. season/game/block setup
5. full AI interface design
6. future defensive or special teams workflows

---

## 3. Non-Negotiables

1. Pass 1 writes only through proposal/validate/commit.
2. Dictation output is candidate/proposal data only.
3. Manual field edits and narration-derived edits must use the same commit discipline.
4. Unknown governed values must trigger lookup governance before commit.
5. Prediction values must be visible defaults, not silent writes.
6. Pass 1 must not overwrite Pass 2 personnel by default.
7. Pass 1 must not overwrite Pass 3 grades by default.
8. Pass 1 must preserve untouched committed fields.
9. Commit & Next commits the current play only, then opens the next slot.
10. Hudl export shape must not change because of Pass 1 behavior.

---

## 4. Pass 1 Owned Field Set

Pass 1 primarily owns these fields:

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
| `gainLoss` | `GN/LS` | gain or loss |
| `twoMin` | `2 MIN` | two-minute marker |
| `rusher` | `RUSHER` | rusher / ball carrier |
| `passer` | `PASSER` | passer |
| `receiver` | `RECEIVER` | receiver |
| `penalty` | `PENALTY` | penalty |
| `penYards` | `PEN YARDS` | penalty yards |
| `eff` | `EFF` | efficiency marker |
| `offStrength` | `OFF STR` | formation-derived strength |
| `personnel` | `PERSONNEL` | formation-derived personnel group |
| `playType` | `PLAY TYPE` | play-derived type |
| `playDir` | `PLAY DIR` | play-derived direction |
| `motionDir` | `MOTION DIR` | motion-derived direction |
| `returner` | `RETURNER` | returner where relevant |

Pass 1 may show scaffold/context fields such as `playNum`, `qtr`, `odk`, and `series`, but those are not ordinary Pass 1 play-detail observations.

---

## 5. Pass 1 Must Not Own

Pass 1 must not own:

```text
posLT, posLG, posC, posRG, posRT, posY, posX, pos1, pos2, pos3, pos4
```

Those are Pass 2 personnel fields.

Pass 1 must not own:

```text
gradeLT, gradeLG, gradeC, gradeRG, gradeRT, gradeX, gradeY, grade1, grade2, grade3, grade4
```

Those are Pass 3 grade fields.

Pass 1 parser/narration should not update these fields unless an explicit cross-pass edit workflow is designed and guarded.

---

## 6. Pass 1 Section Behavior

The Pass 1 section should behave as a focused workspace for basic play details.

Required section behavior:

1. show active play context
2. show current committed Pass 1 values, if any
3. allow manual field edits
4. allow typed narration where supported
5. allow voice dictation where supported
6. show proposal before commit
7. show lookup interruptions for unknown governed values
8. show prediction/provenance where useful
9. preserve unrelated committed fields
10. support Commit and Commit & Next

---

## 7. Manual Entry Behavior

Manual entry changes create proposal values.

Rules:

1. manual field changes should mark fields as touched
2. manual values should use coach/manual provenance
3. manual edits to committed non-null values should trigger overwrite review
4. manual field edits should not auto-commit
5. manual edits should not clear unrelated fields

---

## 8. Dictation / Transcript Behavior

Dictation captures coach speech and converts it into candidate text.

Rules:

1. dictation text is not committed data
2. stopping dictation should not commit a play
3. dictation should not duplicate transcript text across start/stop cycles
4. dictation should preserve existing manually typed text unless explicitly replaced
5. dictation should feed the same parser/proposal path as typed narration
6. dictation should not directly write committed rows
7. dictation should not bypass lookup governance
8. dictation should not bypass overwrite review

### 8.1 Dictation Text Accumulation

Dictation should avoid cumulative re-append bugs.

Preferred conceptual behavior:

```text
base text before dictation + live transcript = displayed draft text
```

On stop:

```text
persist final displayed draft text once
```

Do not repeatedly append the full transcript on every interim update.

### 8.2 Restarting Dictation

If the coach starts dictation again after stopping:

1. the existing draft text should remain
2. new transcript should append once with a sensible separator
3. previously captured transcript should not duplicate
4. stopping again should persist once

---

## 9. Typed Narration Behavior

Typed narration should follow the same candidate/proposal path as dictation.

Rules:

1. typed narration may be parsed into Pass 1 fields
2. parsed values remain proposal values
3. unknown governed values trigger lookup governance
4. ambiguous values are flagged or left unresolved
5. typed narration should not commit directly

---

## 10. Pass 1 Parser Scope

Pass 1 parser may extract:

| Category | Example | Field(s) |
|---|---|---|
| down/distance | “first and ten” | `dn`, `dist` |
| yard line | “on our own thirty-five” | `yardLn` |
| hash | “middle hash” | `hash` |
| formation | “in Black” | `offForm` |
| play | “running 26 Punch” | `offPlay` |
| motion | “3 Across motion” | `motion` |
| result/gain | “got four yards” | `result`, `gainLoss` |
| rusher | “number three was the ball carrier” | `rusher` |
| passer | “seven threw it” | `passer` |
| receiver | “complete to eighty-four” | `receiver` |
| penalty | “holding on us” | `penalty`, `penYards` where derivable |

Pass 1 parser must not silently infer actors when the role is unclear.

---

## 11. Lookup-Governed Pass 1 Fields

Governed Pass 1 fields:

```text
offForm, offPlay, motion
```

Dependent fields:

| Governing Field | Dependent Fields |
|---|---|
| `offForm` | `offStrength`, `personnel` |
| `offPlay` | `playType`, `playDir` |
| `motion` | `motionDir` |

Unknown governed values must trigger lookup governance before valid commit.

---

## 12. Multiple Unknowns in One Pass 1 Narration

A single narration may include unknown formation, play, and motion.

Example:

```text
Black formation, 3 Across motion, 26 Punch for four yards
```

Rules:

1. track each unknown separately
2. resolving one unknown must not lose the others
3. after each resolution, rerun normalization
4. final proposal must show all resolved values and dependents
5. avoid modal loops
6. coach must be able to exit/pause

---

## 13. Prediction Defaults in Pass 1

Pass 1 may show predicted/default values for:

```text
yardLn, dn, dist, eff, penYards
```

Rules:

1. prediction defaults are visible before commit
2. predicted values show provenance where useful
3. coach may override predicted values
4. prediction does not write directly to committed rows
5. prediction does not silently recalculate committed downstream rows

Yard-line prediction is governed by `prediction-logic.md` and must use the internal index model.

---

## 14. Actor Extraction

### 14.1 Rusher / Ball Carrier

Examples that should map to `rusher`:

```text
number three was the ball carrier
#3 was the ball carrier
three carried it
three on the carry
ball carrier was 3
rusher was 3
3 ran it
```

### 14.2 Passer

Examples that should map to `passer`:

```text
seven threw it
quarterback seven
passer was 7
7 on the pass
```

### 14.3 Receiver

Examples that should map to `receiver`:

```text
complete to 84
receiver was 84
84 caught it
thrown to 84
```

### 14.4 Ambiguous Actor Rule

If a jersey number is mentioned without a clear role, do not silently set an actor field.

Example:

```text
84 made a good play
```

This is not enough to set `receiver = 84`.

---

## 15. Result and Gain/Loss Behavior

Pass 1 should support result/gain narration.

Examples:

```text
rush for four
completed for six
incomplete
sack minus five
```

Rules:

1. clear gain/loss maps to `gainLoss`
2. clear result maps to `result`
3. touchdown result correction may be handled by commit gate where applicable
4. self-correction should prefer the latest clear correction where supported
5. ambiguous gain/loss should be surfaced or left blank

---

## 16. Proposal Review Behavior

A Pass 1 proposal should show:

1. down, distance, yard line, hash
2. formation, play, motion
3. result and gain/loss
4. actors
5. penalty and penalty yards
6. lookup-derived dependent values
7. predicted values
8. provenance indicators where useful
9. validation issues
10. overwrite warnings for touched committed values

The proposal should be readable by a coach, not only by a developer.

---

## 17. Commit Behavior

Commit must:

1. validate the Pass 1 proposal
2. resolve lookup-governed fields
3. preserve untouched committed fields
4. show overwrite review where needed
5. write only after explicit coach action
6. audit material changes where supported
7. leave export shape unchanged

Commit must not:

1. commit raw transcript text as field data unless mapped to valid fields
2. commit unknown governed values
3. commit ambiguous actor guesses
4. mutate Pass 2 personnel by default
5. mutate Pass 3 grades by default

---

## 18. Commit & Next Behavior

Commit & Next must:

1. validate current Pass 1 proposal
2. commit current play only after explicit action
3. advance to the next slot
4. seed next-slot prediction defaults where eligible
5. not commit the next slot
6. preserve current session context

Commit & Next is not a batch commit.

---

## 19. UX Requirements

Pass 1 UX should make clear:

1. active play number
2. active pass
3. committed values
4. proposed values
5. predicted/default values
6. lookup interruptions
7. validation blockers
8. commit controls
9. next-slot transition

Dictation controls should make clear when recording is active and when captured text is merely draft/proposal input.

---

## 20. Acceptance Criteria

### P1S-001 — Pass 1 Owns Only Basic Play Fields

Pass 1 commits do not modify Pass 2 personnel or Pass 3 grades unless explicitly touched through a governed cross-pass flow.

### P1S-002 — Dictation Does Not Commit

Stopping dictation does not commit a play.

### P1S-003 — Dictation Does Not Duplicate Transcript

Starting/stopping dictation multiple times does not duplicate already captured transcript text.

### P1S-004 — Typed Narration and Dictation Share Proposal Path

Typed narration and voice dictation both feed candidate/proposal behavior before commit.

### P1S-005 — Unknown Lookup Blocks Commit

Unknown `offForm`, `offPlay`, or `motion` triggers lookup governance before commit.

### P1S-006 — Multiple Unknowns Preserve Context

A narration with unknown formation, play, and motion preserves all unresolved candidates through governance.

### P1S-007 — Ball Carrier Phrase Maps to Rusher

Narration `number three was the ball carrier` produces proposal `rusher = 3`.

### P1S-008 — Ambiguous Jersey Is Not Assigned

Narration `84 made a good play` does not silently set `receiver = 84`.

### P1S-009 — Prediction Defaults Are Proposal Only

Predicted `yardLn`, `dn`, and `dist` appear before commit and do not write silently.

### P1S-010 — Commit & Next Commits Current Only

Commit & Next commits the current play and opens the next slot without committing the next slot.

### P1S-011 — Manual Edit Triggers Overwrite Review

Changing a committed non-null Pass 1 value triggers before/after overwrite review.

### P1S-012 — Hudl Export Header Unchanged

Pass 1 behavior does not alter Hudl export headers.

---

## 21. Implementation Guardrails for Lovable

### 21.1 Good Inspect Request

```text
Inspect Pass 1 section behavior and dictation only. Do not modify code.
Report how manual edits, typed narration, voice dictation, parser output, lookup governance, prediction defaults, proposal review, and Commit & Next flow through Pass 1.
Compare current behavior against docs/specs/pass1-basic-logging-and-dictation.md.
Do not inspect Pass 2, Pass 3, or Hudl export unless necessary.
```

### 21.2 Good Patch Request

```text
Make the smallest targeted Pass 1 dictation patch.
Dictation must not duplicate transcript text across start/stop cycles.
Stopping dictation must not commit the play.
Dictation output must feed the same proposal path as typed narration.
Do not change Hudl export headers.
Do not change Pass 2 personnel behavior.
Do not change Pass 3 grade behavior.
Add or update focused tests for P1S-002 through P1S-004 if a test surface exists.
```

### 21.3 Bad Request

```text
Improve Pass 1 dictation and play logging.
```

Too broad. That summons the fog orchestra.

---

## 22. Open Issues / Review Items

| ID | Issue | Recommendation |
|---|---|---|
| P1S-001 | Confirm current dictation accumulation behavior | Lovable inspect-only if testing exposes issue |
| P1S-002 | Confirm typed narration and voice dictation share parser/proposal path | Lovable inspect-only |
| P1S-003 | Confirm self-correction behavior such as “3, no 4 yards” | Inspect/test before patching |
| P1S-004 | Confirm multiple unknown governed values preserve context in Pass 1 | Already likely; keep as regression case |
| P1S-005 | Confirm Commit & Next next-slot prediction UX | Testing focus |

---

## 23. Final Operating Rule

Pass 1 should let the coach talk football.

The system can translate. It cannot skip the review table.
