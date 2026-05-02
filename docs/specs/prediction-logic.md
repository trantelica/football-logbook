# Football Engine — Prediction Logic Spec

**Version:** v2.0 draft  
**Status:** Working spec  
**Primary purpose:** define deterministic prediction behavior for yard line, down, distance, efficiency, penalty yards, and carry-forward defaults without allowing silent writes or unsafe math.  
**Canonical owner:** product owner / coach  
**Implementation owner:** Lovable / code implementation agents  
**Repo path:** `docs/specs/prediction-logic.md`

---

## 1. Conclusion

Prediction is deterministic assistance, not committed data.

The Football Engine may predict next-play values, but prediction must remain a visible proposal default until the coach explicitly commits.

The most important prediction rule is the yard-line rule:

```text
YARD LN is a signed football address, not a math-safe field coordinate.
```

Before doing forward-progress math, the system must translate `yardLn` into an internal field index. After math is complete, the system translates the field index back into the signed Hudl-style `YARD LN` value.

Never calculate next yard line by doing this directly:

```text
yardLn + gainLoss
```

That is wrong across midfield and wrong near the goal line.

---

## 2. Architecture Rule

Prediction follows the core transaction model:

```text
committed prior play → deterministic prediction → proposal default → coach review → commit
```

Prediction must not:

1. write directly to committed rows
2. silently update downstream plays
3. bypass proposal review
4. bypass overwrite review
5. alter Hudl export shape
6. mutate lookup/reference data
7. create schema keys

---

## 3. Predicted / Derived Field Inventory

| Field | Export Label | Prediction / Derivation Type | Current Role |
|---|---|---|---|
| `yardLn` | `YARD LN` | next-play prediction | proposal default |
| `dn` | `DN` | next-play prediction | proposal default |
| `dist` | `DIST` | next-play prediction | proposal default |
| `eff` | `EFF` | deterministic efficiency computation | proposal / review-time value |
| `penYards` | `PEN YARDS` | penalty lookup derivation | proposal value |
| `offStrength` | `OFF STR` | formation lookup derivation | proposal value |
| `personnel` | `PERSONNEL` | formation lookup derivation | proposal value |
| `playType` | `PLAY TYPE` | play lookup derivation | proposal value |
| `playDir` | `PLAY DIR` | play lookup derivation | proposal value |
| `motionDir` | `MOTION DIR` | motion lookup derivation | proposal value |
| `posLT`-`pos4` | personnel slots | carry-forward default | proposal default |

This spec focuses primarily on deterministic prediction fields. Lookup-derived fields are governed by `lookup-reference-governance.md`.

---

## 4. Yard Line Address Model

### 4.1 Signed `yardLn` Address

`yardLn` is stored/exported as a signed football address.

For an offensive drive:

- negative values represent the offense’s own side of the field
- positive values represent the opponent’s side of the field
- midfield is represented by the half-field value

Examples on an 80-yard field:

| Football Location | Stored `yardLn` |
|---|---:|
| own 30 | -30 |
| own 35 | -35 |
| midfield | 40 |
| opponent 35 | 35 |
| opponent 1 | 1 |

This signed address is readable for coaches and Hudl-style export, but it is not safe for direct arithmetic.

### 4.2 Internal Field Index

Prediction math must use an internal index.

For an 80-yard field:

```text
own 1          → idx 1
own 30         → idx 30
own 39         → idx 39
midfield       → idx 40
opponent 39    → idx 41
opponent 1     → idx 79
goal line      → idx 80
```

For a 100-yard field:

```text
own 1          → idx 1
own 49         → idx 49
midfield       → idx 50
opponent 49    → idx 51
opponent 1     → idx 99
goal line      → idx 100
```

### 4.3 Conversion Functions

Conceptual conversion from signed `yardLn` to internal index:

```ts
function yardLnToIdx(yardLn: number, fieldSize: 80 | 100): number {
  if (yardLn < 0) return -yardLn;
  return fieldSize - yardLn;
}
```

Conceptual conversion from internal index back to signed `yardLn`:

```ts
function idxToYardLn(idx: number, fieldSize: 80 | 100): number {
  const halfField = fieldSize / 2;
  if (idx <= halfField - 1) return -idx;
  return fieldSize - idx;
}
```

### 4.4 Midfield Rule

Midfield is the crossover point and must round-trip correctly.

On an 80-yard field:

```text
idx 40 → yardLn 40
```

Example:

```text
previous yardLn = -35
previous gainLoss = 5
currentIdx = 35
newIdx = 40
predicted yardLn = 40
```

### 4.5 Goal Line Rule

The opponent goal line index is:

```text
goalIdx = fieldSize
```

Not:

```text
fieldSize - 1
```

The last playable yard line before the goal line is:

```text
fieldSize - 1
```

Example on an 80-yard field:

```text
opponent 1 → idx 79
goal line  → idx 80
```

Distance to goal is:

```ts
distToGoal = goalIdx - currentIdx;
```

This distinction is critical near the goal line.

---

## 5. Next Yard Line Prediction

### 5.1 Required Inputs

To predict next `yardLn`, the system needs prior committed play values:

1. previous play exists
2. previous play `odk = O`
3. current slot `odk = O`
4. previous play `result` exists
5. previous play `gainLoss` exists
6. previous play `yardLn` exists
7. no possession-change guardrail blocks prediction
8. no half-time boundary blocks prediction
9. no generic penalty/safety result blocks prediction

### 5.2 Computation

Conceptual flow:

```text
currentIdx = yardLnToIdx(prevPlay.yardLn, fieldSize)
rawNewIdx = currentIdx + prevPlay.gainLoss
predictedYardLn = idxToYardLn(rawNewIdx, fieldSize)
```

### 5.3 Field Overflow / Scoring Boundary

If forward progress leaves the playable field, prediction should suspend rather than fake certainty.

Suspend when:

```text
rawNewIdx < 1
rawNewIdx >= goalIdx
```

Current behavior treats scoring/safety boundary prediction as deferred.

The system should explain:

```text
Forward progress exceeded playable field; scoring/safety logic deferred. Prediction suspended.
```

### 5.4 No Direct Arithmetic Rule

Never calculate:

```text
nextYardLn = previousYardLn + gainLoss
```

Example failure on an 80-yard field:

```text
previous yardLn = -35
gainLoss = 10
wrong direct math = -25
correct index math = 35
```

Direct signed math moves backward after crossing midfield. Index math preserves football direction.

---

## 6. Down and Distance Prediction

### 6.1 Required Inputs

To predict `dn` and `dist`, the system needs all yard-line inputs plus:

1. previous play `dn`
2. previous play `dist`

If `dn` or `dist` is missing, the system may still predict `yardLn` but should leave `dn` and/or `dist` blank.

### 6.2 First Down Rule

If:

```text
gainLoss >= previous dist
```

Then:

```text
predicted dn = 1
predicted dist = min(10, distToGoal)
```

Where:

```text
distToGoal = goalIdx - rawNewIdx
```

### 6.3 Normal Progression Rule

If no first down and previous down is less than 4:

```text
predicted dn = previous dn + 1
predicted dist = previous dist - gainLoss
```

### 6.4 Fourth Down Guardrail

If fourth down fails to reach the line to gain, possession likely changes.

Prediction should suspend rather than assume the next offensive state unless the implementation has an explicit possession model.

### 6.5 Goal-to-Go / Near Goal Line Rule

When a first down is achieved near the goal line:

```text
predicted dist = min(10, distToGoal)
```

Example on an 80-yard field:

```text
previous yardLn = 5
currentIdx = 75
gainLoss = 4
rawNewIdx = 79
distToGoal = 80 - 79 = 1
predicted yardLn = 1
predicted dn = 1
predicted dist = 1
```

---

## 7. Prediction Eligibility Gates

Prediction should suspend when any of these conditions apply:

| Gate | Suspend Condition | Explanation Direction |
|---|---|---|
| G0 | half-time boundary | Auto-fill paused: start of 2nd half |
| G1 | previous play missing | previous slot not available |
| G2 | previous play not offensive | previous play is not offensive |
| G3 | current slot not offensive | current play is not offensive |
| G4 | possession likely changed | next yard line/down/distance not predicted |
| G5 | generic penalty result | penalty recorded; not predicted |
| G6 | result missing | result missing on previous play |
| G7 | gain/loss missing | gain/loss missing on previous play |
| G8 | yard line missing | yard line missing on previous play |
| G9 | field overflow/scoring boundary | scoring/safety logic deferred |

Prediction should fail safe by leaving fields blank rather than inventing values.

---

## 8. Penalty Prediction / Derivation

### 8.1 Penalty Yardage

`penYards` may be derived from a fixed penalty map when `penalty` is selected.

Rules:

1. `penalty` must be a fixed allowed value.
2. `penYards` may derive from the penalty map.
3. Coach override policy must be explicit if allowed.
4. Derived `penYards` remains proposal-visible before commit.

### 8.2 Penalty Result Behavior

If previous result is generic:

```text
Penalty
Penalty, Safety
```

Then next-play yard line/down/distance prediction should suspend.

If a penalty is present but the result records the net play outcome, prediction may proceed with a note:

```text
Penalty noted. Next-play values based on net result recorded.
```

### 8.3 Offsetting Penalties

If result is:

```text
Offsetting Penalties
```

Then replay-down behavior may hold prior values:

```text
yardLn = prior yardLn
dn = prior dn
dist = prior dist
```

Where prerequisites exist.

---

## 9. Efficiency (`EFF`) Computation

`eff` is a deterministic computed marker, not a free-form AI judgment.

### 9.1 Inputs

Efficiency computation may use:

1. `result`
2. `gainLoss`
3. `dn`
4. `dist`
5. `penalty`

### 9.2 Rules

Return `null` if penalty is present.

Return `Y` if result contains:

```text
TD
```

Return `Y` if:

```text
gainLoss >= dist
```

Return `Y` on first down if:

```text
gainLoss >= 0.50 * dist
```

Return `Y` on second down if:

```text
gainLoss >= 0.40 * dist
```

On third or fourth down, only touchdown or first-down achievement should produce `Y`.

Otherwise return:

```text
N
```

### 9.3 Missing Inputs

If result is not TD and any of `dn`, `dist`, or `gainLoss` is missing, return `null`.

### 9.4 Review Timing

`eff` should be computed before or during proposal review, not silently after final commit in a way the coach cannot see.

---

## 10. Commit-Gate Gain/Loss QC Near Goal Line

Commit quality control may limit gain/loss to distance-to-goal where the play reaches or exceeds the goal line.

This uses the same internal index model.

Conceptual flow:

```text
currentIdx = yardLnToIdx(yardLn, fieldSize)
goalIdx = fieldSize
distToGoal = goalIdx - currentIdx
```

If:

```text
gainLoss > distToGoal
```

Then:

```text
adjusted gainLoss = distToGoal
```

The coach-facing message should be direct:

```text
Gain limited to [distToGoal]: play can't advance beyond the goal line.
```

If the play reaches the goal line and result lacks a TD suffix, the system may prompt for TD result correction.

Example mappings:

| Base Result | Corrected Result |
|---|---|
| Rush | Rush, TD |
| Complete | Complete, TD |
| Scramble | Scramble, TD |

This QC must remain reviewable and must not silently rewrite committed data without the commit gate.

---

## 11. Carry-Forward Defaults

Carry-forward is a prediction-like default mechanism but should be treated separately from football field-position prediction.

Current primary carry-forward area:

```text
Pass 2 personnel slots
```

Canonical carry-forward fields:

```text
posLT, posLG, posC, posRG, posRT, posY, posX, pos1, pos2, pos3, pos4
```

Rules:

1. carry-forward seeds proposal state only
2. carry-forward must be visible before commit
3. carry-forward must not overwrite committed personnel
4. seed-on-open and Commit & Next should use the same source policy
5. source is most recent prior committed offensive play with complete personnel unless revised by spec

---

## 12. Field Size Configuration

Prediction supports configured field sizes:

```text
80
100
```

Field size affects:

1. yard line index conversion
2. midfield index
3. goal line index
4. distance-to-goal
5. overflow/scoring-boundary checks
6. commit-gate gain/loss QC

Field size changes must not silently rewrite historical committed rows.

---

## 13. Proposal UX Requirements

Predicted fields should show provenance.

Recommended badges:

| Field | Badge |
|---|---|
| predicted yard line | Predicted |
| predicted down | Predicted |
| predicted distance | Predicted |
| computed efficiency | Logic / Predicted |
| derived penalty yards | Lookup |
| carry-forward personnel | Carry-forward |

Prediction explanations should be short and coach-readable.

Example:

```text
Prediction paused: previous play missing gain/loss.
```

---

## 14. Acceptance Criteria

### PRED-001 — Yard Line Uses Index Model

Given:

```text
fieldSize = 80
yardLn = -35
gainLoss = 10
```

Then:

```text
predicted yardLn = 35
```

Not:

```text
-25
```

### PRED-002 — Midfield Round Trip

On an 80-yard field:

```text
idx 40 → yardLn 40
yardLn 40 → idx 40
```

### PRED-003 — Opponent 1 Uses Goal Index Correctly

On an 80-yard field:

```text
yardLn 1 → idx 79
goalIdx = 80
distToGoal = 1
```

### PRED-004 — First Down Near Goal Line

Given:

```text
fieldSize = 80
yardLn = 5
dn = 1
dist = 3
gainLoss = 4
```

Then:

```text
predicted yardLn = 1
predicted dn = 1
predicted dist = 1
```

### PRED-005 — Missing Down Still Allows Yard Line Prediction

Given prior play has `yardLn`, `gainLoss`, and `result`, but no `dn`, then:

```text
yardLn may predict
dn remains blank
dist remains blank
```

### PRED-006 — Generic Penalty Suspends Prediction

Given previous result is:

```text
Penalty
```

Then yard line/down/distance prediction suspends.

### PRED-007 — Offsetting Penalties Hold Values

Given previous result is:

```text
Offsetting Penalties
```

Then prior yard line/down/distance may hold if available.

### PRED-008 — Fourth Down Failure Suspends Prediction

Given previous play is fourth down and fails to reach the line to gain, prediction suspends due to likely possession change.

### PRED-009 — Efficiency Computes Deterministically

Given:

```text
dn = 1
dist = 10
gainLoss = 5
result = Rush
penalty = null
```

Then:

```text
eff = Y
```

### PRED-010 — Penalty Leaves Efficiency Blank

Given any penalty is present, then:

```text
eff = null
```

### PRED-011 — Carry-Forward Is Proposal Only

Given prior complete committed personnel, opening an empty Pass 2 slot seeds personnel into proposal only.

### PRED-012 — Export Does Not Recalculate Prediction

Export reads committed rows only and does not run prediction to fill blanks.

---

## 15. Implementation Guardrails for Lovable

### 15.1 Good Inspect Request

```text
Inspect prediction logic only. Do not modify code.
Confirm yardLn uses yardLnToIdx and idxToYardLn before math.
Confirm goalIdx is fieldSize, not fieldSize - 1.
Confirm prediction writes proposal defaults only and does not mutate committed rows.
Report mismatches against docs/specs/prediction-logic.md.
```

### 15.2 Good Patch Request

```text
Make the smallest targeted prediction patch.
Ensure next yard line is computed through the index model, not direct signed yardLn arithmetic.
Do not change Hudl export headers.
Do not change canonical field keys.
Do not alter Pass 2 carry-forward behavior.
Add or update focused tests for PRED-001 through PRED-004.
```

### 15.3 Bad Request

```text
Improve prediction logic.
```

Too broad. Prediction is where tidy-looking math can quietly become a goblin with a clipboard.

---

## 16. Open Issues / Review Items

| ID | Issue | Recommendation |
|---|---|---|
| PRED-FS-001 | Scoring/safety boundary prediction is deferred | Keep suspended until explicitly designed |
| PRED-FS-002 | Possession model after fourth down failure is limited | Keep guardrail; do not infer new possession silently |
| PRED-FS-003 | PAT and special teams prediction | Defer until special teams workflow activation |
| PRED-FS-004 | Prediction explanation UI detail level | Defer to UX refinement |
| PRED-FS-005 | Automated test coverage mapping | Align with `src/test/prediction.test.ts` and future docs |

---

## 17. Final Operating Rule

Yard line is a football address. Prediction math needs a field index.

Translate, calculate, translate back, then show the result to the coach before anything touches the ledger.
