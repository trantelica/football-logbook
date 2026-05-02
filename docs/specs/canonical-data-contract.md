# Football Engine — Canonical Data Contract / Schema Spec

**Version:** v2.0 draft  
**Status:** Working spec  
**Primary purpose:** protect the Hudl-ready output structure and prevent schema drift.  
**Canonical owner:** product owner / coach  
**Implementation owner:** Lovable / code implementation agents  
**Repo path:** `docs/specs/canonical-data-contract.md`

---

## 1. Conclusion

The **Hudl Plays CSV export contract is the highest-authority schema surface** for play-row output.

The application may use internal implementation keys such as `posLT`, `gradeLT`, or `yardLn`, but those keys do **not** define the Hudl output contract by themselves. Hudl depends on the exported column labels, column order, and row values conforming exactly to the governed export shape.

The canonical data flow remains:

```text
candidate → proposal → validate → commit → audit → export
```

No parser, AI assistant, prediction rule, carry-forward rule, lookup append, roster action, UI alias, or internal implementation key may bypass this contract.

---

## 2. Authority Model

When schema surfaces conflict, resolve them in this order:

| Rank | Schema Surface | Authority |
|---:|---|---|
| 1 | Frozen Hudl Plays CSV export header contract | Highest authority for export shape |
| 2 | This Canonical Data Contract | Governs intended product/output contract |
| 3 | PDR Section 8 | Original product source of truth and fallback for unresolved fields |
| 4 | Code implementation | Evidence of current behavior, not automatically canonical |
| 5 | UI labels and display aliases | Presentation only |
| 6 | Parser phrases / AI labels | Candidate-generation only |

### Rule

If code behavior differs from this spec, classify the difference as one of:

1. **Implementation defect**
2. **Intentional internal alias**
3. **Spec update candidate**
4. **Deferred design issue**

The code does not silently win.

---

## 3. Scope

This spec governs:

1. Hudl Plays CSV output columns
2. canonical play-row field meanings
3. internal implementation key mapping
4. export label mapping
5. data types and allowed values
6. required/null behavior
7. prediction and carry-forward defaults
8. lookup-derived fields
9. personnel slot canonicalization
10. blocking grade field canonicalization
11. implementation drift rules

This spec does **not** govern:

1. UI layout details
2. parser grammar details
3. full lookup append UX
4. full transaction architecture
5. future defensive or kicking expansion not yet active in the current Hudl export

---

## 4. Current Implementation Grounding

Current code contains a frozen Hudl export contract in:

```text
src/engine/hudlExport.ts
```

That file defines:

```text
EXPORT_FORMAT_VERSION = "8.1.0"
HUDL_HEADERS = Object.freeze([...])
```

The implementation comment is directionally correct and should remain governing:

```text
Order and contents must NOT drift. Do NOT derive dynamically from playSchema.
```

Current code also contains a known metadata mismatch in:

```text
src/engine/schema.ts
```

Specifically, `pos1` through `pos4` use `outputLabel` values like `POS 1`, while the frozen Hudl export header correctly uses `1`, `2`, `3`, and `4`.

This spec treats the frozen Hudl export labels as canonical.

---

## 5. Frozen Hudl Plays CSV Header Contract

The following columns define the governed Hudl export shape. **Order matters.**

| # | Internal Key | Hudl Export Label | Canonical Meaning | Active Pass |
|---:|---|---|---|---:|
| 1 | `playNum` | `PLAY #` | Play number / slot number | 0 |
| 2 | `qtr` | `QTR` | Quarter | 0 |
| 3 | `odk` | `ODK` | Offense / Defense / Kicking / Segment marker | 0 |
| 4 | `series` | `SERIES` | Offensive series number or scaffolded series | 0 |
| 5 | `yardLn` | `YARD LN` | Signed relative yard line | 1 |
| 6 | `dn` | `DN` | Down | 1 |
| 7 | `dist` | `DIST` | Distance to gain | 1 |
| 8 | `hash` | `HASH` | Ball location across field | 1 |
| 9 | `offForm` | `OFF FORM` | Offensive formation | 1 |
| 10 | `offPlay` | `OFF PLAY` | Offensive play call | 1 |
| 11 | `motion` | `MOTION` | Offensive motion | 1 |
| 12 | `result` | `RESULT` | Play result | 1 |
| 13 | `gainLoss` | `GN/LS` | Gain or loss | 1 |
| 14 | `twoMin` | `2 MIN` | Two-minute situation marker | 1 |
| 15 | `rusher` | `RUSHER` | Rusher / ball carrier jersey | 1 |
| 16 | `passer` | `PASSER` | Passer jersey | 1 |
| 17 | `receiver` | `RECEIVER` | Receiver jersey | 1 |
| 18 | `penalty` | `PENALTY` | Penalty canonical value | 1 |
| 19 | `penYards` | `PEN YARDS` | Penalty yards | 1 |
| 20 | `eff` | `EFF` | Efficient play marker | 1 |
| 21 | `offStrength` | `OFF STR` | Formation-derived offensive strength | 1 |
| 22 | `personnel` | `PERSONNEL` | Formation-derived offensive personnel group | 1 |
| 23 | `playType` | `PLAY TYPE` | Play-derived type | 1 |
| 24 | `playDir` | `PLAY DIR` | Play-derived direction | 1 |
| 25 | `motionDir` | `MOTION DIR` | Motion-derived direction | 1 |
| 26 | `posLT` | `LT` | Left tackle jersey | 2 |
| 27 | `posLG` | `LG` | Left guard jersey | 2 |
| 28 | `posC` | `C` | Center jersey | 2 |
| 29 | `posRG` | `RG` | Right guard jersey | 2 |
| 30 | `posRT` | `RT` | Right tackle jersey | 2 |
| 31 | `posX` | `X` | X receiver jersey | 2 |
| 32 | `posY` | `Y` | Y / TE jersey | 2 |
| 33 | `pos1` | `1` | Skill slot 1 jersey | 2 |
| 34 | `pos2` | `2` | Skill slot 2 jersey | 2 |
| 35 | `pos3` | `3` | Skill slot 3 jersey | 2 |
| 36 | `pos4` | `4` | Skill slot 4 jersey | 2 |
| 37 | `returner` | `RETURNER` | Returner jersey | 1 / future kicking |
| 38 | `gradeLT` | `LT GRADE` | Left tackle blocking grade | 3 |
| 39 | `gradeLG` | `LG GRADE` | Left guard blocking grade | 3 |
| 40 | `gradeC` | `C GRADE` | Center blocking grade | 3 |
| 41 | `gradeRG` | `RG GRADE` | Right guard blocking grade | 3 |
| 42 | `gradeRT` | `RT GRADE` | Right tackle blocking grade | 3 |
| 43 | `gradeX` | `X GRADE` | X receiver blocking grade | 3 |
| 44 | `gradeY` | `Y GRADE` | Y / TE blocking grade | 3 |
| 45 | `grade1` | `1 GRADE` | Skill slot 1 blocking grade | 3 |
| 46 | `grade2` | `2 GRADE` | Skill slot 2 blocking grade | 3 |
| 47 | `grade3` | `3 GRADE` | Skill slot 3 blocking grade | 3 |
| 48 | `grade4` | `4 GRADE` | Skill slot 4 blocking grade | 3 |

### 5.1 Mandatory Header Invariant

The Hudl Plays CSV header row must be exactly:

```csv
PLAY #,QTR,ODK,SERIES,YARD LN,DN,DIST,HASH,OFF FORM,OFF PLAY,MOTION,RESULT,GN/LS,2 MIN,RUSHER,PASSER,RECEIVER,PENALTY,PEN YARDS,EFF,OFF STR,PERSONNEL,PLAY TYPE,PLAY DIR,MOTION DIR,LT,LG,C,RG,RT,X,Y,1,2,3,4,RETURNER,LT GRADE,LG GRADE,C GRADE,RG GRADE,RT GRADE,X GRADE,Y GRADE,1 GRADE,2 GRADE,3 GRADE,4 GRADE
```

### 5.2 Header Rules

1. Header count must be exactly **48**.
2. Header order must not drift.
3. Empty exports must still produce the header row.
4. Headers must include `1`, `2`, `3`, `4`.
5. Headers must not include `POS 1`, `POS 2`, `POS 3`, or `POS 4`.
6. Headers must include `1 GRADE`, `2 GRADE`, `3 GRADE`, `4 GRADE`.
7. Headers must not be dynamically derived from `playSchema` unless `playSchema` is first reconciled to this contract.

---

## 6. Known Implementation Drift: Skill Slot Labels

| Internal Key | Current Schema Metadata Label | Frozen Hudl Export Label | Canonical Resolution |
|---|---|---|---|
| `pos1` | `POS 1` | `1` | Hudl export label `1` is canonical |
| `pos2` | `POS 2` | `2` | Hudl export label `2` is canonical |
| `pos3` | `POS 3` | `3` | Hudl export label `3` is canonical |
| `pos4` | `POS 4` | `4` | Hudl export label `4` is canonical |

`POS 1`, `POS 2`, `POS 3`, and `POS 4` are not canonical Hudl output labels. They may appear internally only if explicitly marked as internal, legacy, or transitional.

Recommended future patch:

```text
Update schema metadata outputLabel for pos1-pos4 from POS 1..POS 4 to 1..4, but do not change the already-correct Hudl export contract.
```

---

## 7. Canonical Personnel Slot Model

The canonical offensive personnel slots are:

```text
LT, LG, C, RG, RT, Y, X, 1, 2, 3, 4
```

### 7.1 Internal Key Mapping

| Canonical Slot | Internal Key | Hudl Export Label | Value Type |
|---|---|---|---|
| LT | `posLT` | `LT` | jersey number |
| LG | `posLG` | `LG` | jersey number |
| C | `posC` | `C` | jersey number |
| RG | `posRG` | `RG` | jersey number |
| RT | `posRT` | `RT` | jersey number |
| Y | `posY` | `Y` | jersey number |
| X | `posX` | `X` | jersey number |
| 1 | `pos1` | `1` | jersey number |
| 2 | `pos2` | `2` | jersey number |
| 3 | `pos3` | `3` | jersey number |
| 4 | `pos4` | `4` | jersey number |

### 7.2 Personnel Alias Rule

Personnel aliases are display and translation helpers only. They must not change:

1. stored canonical keys
2. proposal patch keys
3. committed row keys
4. Hudl export labels
5. audit field names

Example:

| Display Alias | Canonical Slot | Internal Key | Export Label |
|---|---|---|---|
| Z | 1 | `pos1` | `1` |
| H | 2 | `pos2` | `2` |
| F | 3 | `pos3` | `3` |
| RB | 4 | `pos4` | `4` |

The actual alias set may vary by team, but the canonical slots do not.

---

## 8. Canonical Grade Field Model

Blocking grades attach to canonical offensive personnel slots.

| Canonical Slot | Internal Grade Key | Hudl Export Label | Allowed Values |
|---|---|---|---|
| LT | `gradeLT` | `LT GRADE` | -3, -2, -1, 0, 1, 2, 3 |
| LG | `gradeLG` | `LG GRADE` | -3, -2, -1, 0, 1, 2, 3 |
| C | `gradeC` | `C GRADE` | -3, -2, -1, 0, 1, 2, 3 |
| RG | `gradeRG` | `RG GRADE` | -3, -2, -1, 0, 1, 2, 3 |
| RT | `gradeRT` | `RT GRADE` | -3, -2, -1, 0, 1, 2, 3 |
| X | `gradeX` | `X GRADE` | -3, -2, -1, 0, 1, 2, 3 |
| Y | `gradeY` | `Y GRADE` | -3, -2, -1, 0, 1, 2, 3 |
| 1 | `grade1` | `1 GRADE` | -3, -2, -1, 0, 1, 2, 3 |
| 2 | `grade2` | `2 GRADE` | -3, -2, -1, 0, 1, 2, 3 |
| 3 | `grade3` | `3 GRADE` | -3, -2, -1, 0, 1, 2, 3 |
| 4 | `grade4` | `4 GRADE` | -3, -2, -1, 0, 1, 2, 3 |

Grade values are optional unless a future workflow explicitly requires them. A blank grade exports as an empty cell.

---

## 9. Field-Level Contract

### 9.1 Pass 0 / Scaffold Fields

| Key | Export Label | Type | Required | Allowed Values | Source | Default Policy | Notes |
|---|---|---|---|---|---|---|---|
| `playNum` | `PLAY #` | integer | Yes | >0 | COACH / scaffold | initialization | Immutable slot identity |
| `qtr` | `QTR` | integer/string enum | Yes | 1, 2, 3, 4, 5 | COACH / scaffold | initialization | 5 represents overtime |
| `odk` | `ODK` | enum | Yes | O, D, K, S | COACH / scaffold | initialization | `S` is segment/index row |
| `series` | `SERIES` | integer | No | >0 | LOGIC | initialization / scaffold | Must not silently cascade after edits |

### 9.2 Pass 1 / Basic Play Metadata

| Key | Export Label | Type | Required | Allowed Values | Source | Default Policy | Notes |
|---|---|---|---|---|---|---|---|
| `yardLn` | `YARD LN` | integer | No | signed field coordinate | LOGIC / COACH | predict | Parameterized by field size |
| `dn` | `DN` | integer | No | 1, 2, 3, 4 | LOGIC / COACH | predict | Visible proposal default only |
| `dist` | `DIST` | integer | No | positive integer | LOGIC / COACH | predict | Visible proposal default only |
| `hash` | `HASH` | enum | No | L, M, R | COACH | null | Hash values use M for middle |
| `offForm` | `OFF FORM` | string | No | season lookup | LOOKUP / COACH candidate | null | Governs `offStrength`, `personnel` |
| `offPlay` | `OFF PLAY` | string | No | season lookup | LOOKUP / COACH candidate | null | Governs `playType`, `playDir` |
| `motion` | `MOTION` | string | No | season lookup | LOOKUP / COACH candidate | null | Governs `motionDir` |
| `result` | `RESULT` | enum | No | fixed result enum | COACH | null | Must match allowed result values if present |
| `gainLoss` | `GN/LS` | integer | No | reasonable field-bounded integer | COACH | null | Positive gain, negative loss |
| `twoMin` | `2 MIN` | enum | No | Y, N | COACH | null | Current export uses Y/N marker |
| `rusher` | `RUSHER` | integer | No | roster jersey if roster exists | COACH | null | Ball carrier in narration maps here |
| `passer` | `PASSER` | integer | No | roster jersey if roster exists | COACH | null | Actor field |
| `receiver` | `RECEIVER` | integer | No | roster jersey if roster exists | COACH | null | Actor field |
| `penalty` | `PENALTY` | enum | No | fixed penalty enum | COACH | null | Non-maintainable lookup |
| `penYards` | `PEN YARDS` | integer | No | penalty yard map or override | LOOKUP / COACH | lookup-derived | May be derived from penalty |
| `eff` | `EFF` | enum | No | Y, N | LOGIC / COACH | null | Efficiency marker |
| `offStrength` | `OFF STR` | enum | No | L, BAL, R | LOOKUP | lookup-derived | Derived from `offForm` |
| `personnel` | `PERSONNEL` | enum/string | No | 11, 12, 13, 21, 22, 23, 31, 32, 41, 50 | LOOKUP | lookup-derived | Derived from `offForm` |
| `playType` | `PLAY TYPE` | enum | No | fixed play type enum | LOOKUP | lookup-derived | Derived from `offPlay` |
| `playDir` | `PLAY DIR` | enum | No | L, M, R | LOOKUP | lookup-derived | Derived from `offPlay` |
| `motionDir` | `MOTION DIR` | enum | No | L, R | LOOKUP | lookup-derived | Derived from `motion` |
| `returner` | `RETURNER` | integer | No | roster jersey if roster exists | COACH | null | Present in current export; future kicking relevance |

### 9.3 Pass 2 / Personnel

| Key | Export Label | Type | Required | Allowed Values | Source | Default Policy | Notes |
|---|---|---|---|---|---|---|---|
| `posLT` | `LT` | integer | No | roster jersey | COACH | carryForward | Canonical LT slot |
| `posLG` | `LG` | integer | No | roster jersey | COACH | carryForward | Canonical LG slot |
| `posC` | `C` | integer | No | roster jersey | COACH | carryForward | Canonical C slot |
| `posRG` | `RG` | integer | No | roster jersey | COACH | carryForward | Canonical RG slot |
| `posRT` | `RT` | integer | No | roster jersey | COACH | carryForward | Canonical RT slot |
| `posX` | `X` | integer | No | roster jersey | COACH | carryForward | Canonical X slot |
| `posY` | `Y` | integer | No | roster jersey | COACH | carryForward | Canonical Y slot |
| `pos1` | `1` | integer | No | roster jersey | COACH | carryForward | Canonical slot 1 |
| `pos2` | `2` | integer | No | roster jersey | COACH | carryForward | Canonical slot 2 |
| `pos3` | `3` | integer | No | roster jersey | COACH | carryForward | Canonical slot 3 |
| `pos4` | `4` | integer | No | roster jersey | COACH | carryForward | Canonical slot 4 |

### 9.4 Pass 3 / Blocking Grades

| Key | Export Label | Type | Required | Allowed Values | Source | Default Policy | Notes |
|---|---|---|---|---|---|---|---|
| `gradeLT` | `LT GRADE` | integer | No | -3..3 | COACH | null | Blocking grade |
| `gradeLG` | `LG GRADE` | integer | No | -3..3 | COACH | null | Blocking grade |
| `gradeC` | `C GRADE` | integer | No | -3..3 | COACH | null | Blocking grade |
| `gradeRG` | `RG GRADE` | integer | No | -3..3 | COACH | null | Blocking grade |
| `gradeRT` | `RT GRADE` | integer | No | -3..3 | COACH | null | Blocking grade |
| `gradeX` | `X GRADE` | integer | No | -3..3 | COACH | null | Blocking grade |
| `gradeY` | `Y GRADE` | integer | No | -3..3 | COACH | null | Blocking grade |
| `grade1` | `1 GRADE` | integer | No | -3..3 | COACH | null | Blocking grade |
| `grade2` | `2 GRADE` | integer | No | -3..3 | COACH | null | Blocking grade |
| `grade3` | `3 GRADE` | integer | No | -3..3 | COACH | null | Blocking grade |
| `grade4` | `4 GRADE` | integer | No | -3..3 | COACH | null | Blocking grade |

---

## 10. Field Surfaces and Naming Discipline

Each field may appear across several surfaces. These surfaces must not be merged casually.

| Surface | Example | Governance Rule |
|---|---|---|
| Internal key | `pos1` | Used by code/state only |
| Canonical slot | `1` | Product meaning for personnel slot |
| Hudl export label | `1` | Frozen CSV output header |
| UI display label | `1`, `Z`, `RB`, etc. | May vary by configuration |
| Narration phrase | “Z receiver”, “number one”, “slot one” | Parser evidence only |
| Proposal patch key | `pos1` | Must map to internal key, not export label |
| Audit field name | `pos1` or normalized canonical field id | Must remain consistent and inspectable |

### 10.1 Prohibited Drift

The following are prohibited unless this spec is explicitly revised:

1. exporting `POS 1` instead of `1`
2. storing a UI alias as a canonical personnel key
3. allowing parser labels to create new schema keys
4. adding new CSV columns silently
5. reordering CSV columns silently
6. changing null output to literal text
7. letting lookup values change committed historical rows
8. letting prediction or carry-forward write directly to committed data

---

## 11. Lookup-Derived Field Rules

Lookup-governed fields may introduce dependent values into the proposal, but only through governed lookup behavior.

| Governing Field | Dependent Fields | Rule |
|---|---|---|
| `offForm` | `offStrength`, `personnel` | Formation lookup governs strength/personnel |
| `offPlay` | `playType`, `playDir` | Play lookup governs type/direction |
| `motion` | `motionDir` | Motion lookup governs direction |
| `penalty` | `penYards` | Fixed penalty map may derive yardage |

### 11.1 Lookup Output Rule

Lookup-derived values may be inserted into a proposal patch, but they must be visible before commit.

### 11.2 Unknown Lookup Rule

Unknown governed values must not enter committed rows unless the governance flow has resolved them into canonical lookup values.

### 11.3 Export Rule

Exports use canonical lookup values only. Synonyms, raw narration, and parser-normalized variants do not export unless they have been accepted as canonical values.

---

## 12. Prediction and Carry-Forward Rules

### 12.1 Prediction

Prediction-derived fields are proposal defaults only.

Common prediction fields:

- `yardLn`
- `dn`
- `dist`
- `penYards` where penalty mapping applies

Prediction rules:

1. Prediction may populate candidate/proposal defaults.
2. Prediction must be visible before commit.
3. Prediction may be overridden before commit.
4. Prediction must not silently mutate committed records.
5. Editing a prior committed play must not silently cascade downstream changes.

### 12.2 Carry-forward

Carry-forward-derived fields are proposal defaults only.

Common carry-forward fields:

- `posLT`
- `posLG`
- `posC`
- `posRG`
- `posRT`
- `posX`
- `posY`
- `pos1`
- `pos2`
- `pos3`
- `pos4`

Carry-forward rules:

1. Carry-forward may seed empty Pass 2 proposal fields.
2. Carry-forward must not overwrite committed personnel.
3. Carry-forward must remain visible as proposal/candidate data until explicit commit.
4. Seed-on-open and Commit & Next seeding should behave consistently.
5. The source should be the most recent prior committed offensive play with complete personnel, unless a future spec revises this rule.

---

## 13. Requiredness and Export Readiness

### 13.1 Required at Commit

Current minimum commit-required fields:

1. `playNum`
2. `qtr`
3. `odk`

For `ODK = S` segment rows, only the segment-required fields are expected:

```text
playNum, qtr, odk
```

### 13.2 Required Does Not Mean Typed

A required value may be satisfied by:

1. game initialization
2. scaffolded slot creation
3. deterministic carry-forward
4. deterministic prediction
5. coach input
6. governed lookup derivation

But the value must be visible and valid before commit.

### 13.3 Export Validation Minimum

Before Hudl export, the system should validate:

1. `playNum` exists, is integer, and is > 0
2. no duplicate `playNum`
3. enum values, when present, are allowed
4. header row exactly matches the frozen header contract
5. rows are sorted by `playNum`
6. empty values export as empty cells
7. no output cell contains literal `null` or `undefined`

---

## 14. Allowed Value Sets

### 14.1 ODK

```text
O, D, K, S
```

### 14.2 Quarter

```text
1, 2, 3, 4, 5
```

`5` represents overtime.

### 14.3 Down

```text
1, 2, 3, 4
```

### 14.4 Hash

```text
L, M, R
```

### 14.5 Boolean-like Markers

For export-facing marker fields such as `2 MIN` and `EFF`, use:

```text
Y, N
```

### 14.6 Offensive Strength

```text
L, BAL, R
```

### 14.7 Play Direction

```text
L, M, R
```

### 14.8 Motion Direction

```text
L, R
```

### 14.9 Personnel Grouping

Current allowed personnel values:

```text
10, 11, 12, 13, 21, 22, 23, 31, 32, 41, 50
```

### 14.10 Grade Values

```text
-3, -2, -1, 0, 1, 2, 3
```

### 14.11 Play Type Values

```text
2 Pt.
2 Pt. Defend
Extra Pt.
Extra Pt. Block
Fake FG
Fake Punt
FG
FG Block
KO
KO Rec
Onside Kick
Onside Kick Rec
Pass
Punt
Punt Rec
Run
```

### 14.12 Result Values

```text
1st DN
Batted Down
Block
Blocked
COP
Complete
Complete, Fumble
Complete, TD
Def TD
Downed
Dropped
Fair Catch
Fumble
Fumble, Def TD
Good
Incomplete
Interception
Interception, Def TD
Interception, Fumble
No Good
No Good, Def TD
Offsetting Penalties
Out of Bounds
Penalty
Penalty, Safety
Return
Rush
Rush, Safety
Rush, TD
Sack
Sack, Fumble
Sack, Fumble, Def TD
Sack, Safety
Safety
Scramble
Scramble, TD
TD
Timeout
Tipped
Touchback
```

---

## 15. Fields from Original PDR Section 8 Not Yet Active in Current Hudl Export

The original PDR includes future or inactive fields that are not part of the current frozen Hudl Plays CSV contract.

| PDR Field | PDR Output Label | Current Status | Rule |
|---|---|---|---|
| `defFront` | `DEF FRONT` | Future / inactive | Do not add to Hudl export until Pass 4 spec activation |
| `coverage` | `COVERAGE` | Future / inactive | Do not add to Hudl export until Pass 4 spec activation |
| `blitz` | `BLITZ` | Future / inactive | Do not add to Hudl export until Pass 4 spec activation |
| `gap` | `GAP` | Future / inactive | Do not add to Hudl export until Pass 4 spec activation |
| `kicker` | `KICKER` | Future / inactive | Do not add to Hudl export until kicking workflow activation |
| `retYards` | `RET YARDS` | Future / inactive | Do not add to Hudl export until kicking workflow activation |

### 15.1 Current Export Field Not Fully Active in Workflow

| Current Export Field | Label | Status | Rule |
|---|---|---|---|
| `returner` | `RETURNER` | Present in current export | Keep as frozen export column unless deliberately removed by schema revision |
| `patTry` | Not exported in Hudl Plays CSV | Internal / workflow support | Must not appear in Hudl export unless explicitly added through schema revision |

---

## 16. Notes CSV Relationship

Coach notes are separate records and must not mutate `PlayRecord`.

Notes exports may include play context fields, but notes CSV is not the Hudl Plays CSV contract.

If note-context fields conflict with play-row fields, the committed play row remains authoritative.

---

## 17. Schema Change Control

### 17.1 Changes Requiring Explicit Spec Revision

The following require explicit revision of this spec:

1. adding a Hudl export column
2. removing a Hudl export column
3. renaming a Hudl export column
4. reordering Hudl export columns
5. changing a field data type
6. changing an allowed enum value set
7. changing canonical personnel slot names
8. changing grade scale
9. changing null/blank export behavior
10. adding defensive or kicking fields to active export

### 17.2 Changes Allowed Without Spec Revision

The following do not require schema revision if they preserve the contract:

1. UI label copy changes
2. parser phrase improvements
3. dropdown usability improvements
4. display alias configuration
5. internal helper function names
6. test refactors
7. non-output provenance badges

### 17.3 Versioning Recommendation

Use separate version identifiers for:

| Version | Purpose |
|---|---|
| `schemaVersion` | Canonical data contract version |
| `exportFormatVersion` | Hudl export header/format version |
| `appVersion` | Application release version |
| `lookupVersion` | Lookup/reference state version |

These should not be conflated.

---

## 18. Acceptance Tests

### 18.1 Export Header Tests

The system must pass:

1. Empty export produces header row only.
2. Header row exactly matches the frozen Hudl header string.
3. Header count is exactly 48.
4. Headers include `1`, `2`, `3`, `4`.
5. Headers do not include `POS 1`, `POS 2`, `POS 3`, `POS 4`.
6. Headers include `1 GRADE`, `2 GRADE`, `3 GRADE`, `4 GRADE`.
7. Header order is stable.

### 18.2 Row Value Tests

The system must pass:

1. Plays export sorted by `playNum` ascending.
2. Null values export as empty cells.
3. Undefined values export as empty cells.
4. No cell exports literal `null`.
5. No cell exports literal `undefined`.
6. Numeric jersey values export as numbers.
7. Grade values export as integers.
8. Commas in values are CSV-escaped correctly.

### 18.3 Personnel Tests

The system must pass:

1. Pass 2 stores personnel in `posLT`, `posLG`, `posC`, `posRG`, `posRT`, `posY`, `posX`, `pos1`, `pos2`, `pos3`, `pos4`.
2. Export labels are `LT`, `LG`, `C`, `RG`, `RT`, `X`, `Y`, `1`, `2`, `3`, `4`.
3. Display aliases do not alter internal keys.
4. Display aliases do not alter export labels.
5. Carry-forward seeds empty proposal fields only.
6. Carry-forward does not overwrite committed personnel.

### 18.4 Grade Tests

The system must pass:

1. Pass 3 grade fields map to the correct canonical slots.
2. `Y1`-style collapsed narration maps to `gradeY = 1`, not slot `1`, unless parser context indicates otherwise.
3. Grade values outside -3..3 are rejected or flagged.
4. Manual grade edits and narrated grade edits both require review before commit.

---

## 19. Lovable Guardrails for Schema Work

When asking Lovable to touch schema/export logic, use narrow instructions.

### 19.1 Good Lovable Request Pattern

```text
Inspect only. Do not modify code.
Compare the Hudl export header contract against schema.ts outputLabel values.
Report any mismatches, especially personnel slots 1-4.
Do not recommend broad refactors.
```

### 19.2 Bad Lovable Request Pattern

```text
Clean up the schema and make everything consistent.
```

That request is too broad and risks accidental schema drift.

---

## 20. Open Issues / Review Items

| ID | Issue | Recommendation |
|---|---|---|
| CDC-001 | `schema.ts` output labels for `pos1`-`pos4` differ from frozen Hudl export labels | Treat frozen Hudl labels as canonical; patch schema metadata later if needed |
| CDC-002 | `returner` exists in current export though kicking workflow is not fully active | Keep in export for now; document as present/current |
| CDC-003 | `patTry` exists internally but is not exported in Hudl Plays CSV | Keep internal unless future export revision adds it |
| CDC-004 | PDR future defense/kicking fields are not in current Hudl export | Keep inactive until workflow activation |
| CDC-005 | PDR used `p1`-`p4`; implementation uses `pos1`-`pos4` | Treat `pos1`-`pos4` as internal keys mapping to canonical slots `1`-`4` |
| CDC-006 | PDR used `lt`, `lg`, etc.; implementation uses `posLT`, `posLG`, etc. | Treat `pos*` keys as implementation keys mapping to canonical export labels |

---

## 21. Final Operating Rule

The Football Engine may evolve internally, but Hudl output must remain boring, frozen, and exact.

Internal architecture can be helpful and adaptive. The export contract should be granite.
