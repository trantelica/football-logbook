# Football Engine — Test & Acceptance Spec

**Version:** v2.0 draft  
**Status:** Working spec  
**Primary purpose:** define practical acceptance and regression checks for the refreshed Football Engine architecture.  
**Canonical owner:** product owner / coach  
**Implementation owner:** Lovable / code implementation agents  
**Repo path:** `docs/specs/test-acceptance.md`

---

## 1. Conclusion

The Football Engine should be tested against invariants, not vibes.

This spec defines the acceptance checklist for the product’s deterministic architecture:

```text
candidate → proposal → validate → commit → audit → export
```

The goal is not exhaustive enterprise test theater. The goal is a practical regression net that protects Hudl export shape, committed-row integrity, pass boundaries, lookup governance, parser behavior, and coach-facing workflow.

---

## 2. Testing Principles

1. Protect Hudl export first.
2. Protect committed rows from silent mutation.
3. Test proposal behavior before commit behavior.
4. Test each pass as a scoped workflow.
5. Test lookup governance before parser cleverness.
6. Test known bugs as regression cases.
7. Prefer small targeted tests over broad brittle suites.
8. Every Lovable patch should name the acceptance case it protects.
9. Do not expand parser/AI behavior without regression tests.
10. Manual coach testing remains valid when automated coverage is not practical.

---

## 3. Test Categories

| Category | Priority | Purpose |
|---|---:|---|
| Export contract | Critical | protect Hudl output |
| Transaction integrity | Critical | prevent silent mutation |
| Schema validation | Critical | enforce field/enum rules |
| Lookup governance | High | prevent vocabulary drift |
| Pass 1 workflow | High | protect basic play logging |
| Pass 2 workflow | High | protect personnel assignment |
| Pass 3 workflow | High | protect grading workflow |
| Parser/narration | Medium/High | protect natural input behavior |
| UX interaction | Medium | protect coach workflow clarity |
| Persistence/audit | Medium | protect session trust ledger |
| Future pass activation | Deferred | prevent accidental scope expansion |

---

## 4. Test Naming Convention

Recommended format:

```text
[AREA]-[NUMBER] — [Behavior]
```

Examples:

```text
EXPORT-001 — Hudl header matches frozen contract
P2-003 — Empty Pass 2 slot seeds from prior complete personnel
P3-004 — Y1 parses as gradeY = 1
LOOKUP-002 — Unknown formation blocks commit until resolved
```

---

## 5. Critical Export Contract Tests

### EXPORT-001 — Hudl Header Matches Frozen Contract

**Given** any export action  
**When** Hudl Plays CSV is generated  
**Then** the header row must exactly equal:

```csv
PLAY #,QTR,ODK,SERIES,YARD LN,DN,DIST,HASH,OFF FORM,OFF PLAY,MOTION,RESULT,GN/LS,2 MIN,RUSHER,PASSER,RECEIVER,PENALTY,PEN YARDS,EFF,OFF STR,PERSONNEL,PLAY TYPE,PLAY DIR,MOTION DIR,LT,LG,C,RG,RT,X,Y,1,2,3,4,RETURNER,LT GRADE,LG GRADE,C GRADE,RG GRADE,RT GRADE,X GRADE,Y GRADE,1 GRADE,2 GRADE,3 GRADE,4 GRADE
```

### EXPORT-002 — Header Count Is 48

**Then** export header count must be exactly 48.

### EXPORT-003 — Skill Slot Labels Are Canonical

**Then** export headers must include:

```text
1, 2, 3, 4
```

**And must not include:**

```text
POS 1, POS 2, POS 3, POS 4
```

### EXPORT-004 — Empty Values Export Blank

**Given** null or undefined field values  
**Then** CSV cells export blank  
**And** never export literal `null` or `undefined`.

### EXPORT-005 — Rows Sort by Play Number

**Given** committed rows out of order in memory  
**When** exported  
**Then** rows sort by `playNum` ascending.

### EXPORT-006 — Export Does Not Mutate Session Rows

**Given** committed rows  
**When** export runs  
**Then** committed rows remain unchanged.

---

## 6. Transaction Integrity Tests

### TXN-001 — No Silent Commit

**Given** parser, AI, lookup, prediction, or carry-forward proposes values  
**Then** no committed row changes until explicit coach commit action.

### TXN-002 — Proposal Is Review Surface

**Given** candidate values exist  
**When** proposal is generated  
**Then** proposed values are visible before commit.

### TXN-003 — Preserve Untouched Fields

**Given** an existing committed play  
**When** a proposal touches only Pass 3 grade fields  
**Then** all Pass 1 and Pass 2 fields remain unchanged after commit.

### TXN-004 — Overwrite Review Required

**Given** committed non-null value `offPlay = 26 Punch`  
**When** proposal changes it to `38 Punch`  
**Then** before/after overwrite review appears before commit.

### TXN-005 — Prediction Is Proposal Only

**Given** predicted down/distance/yardline values  
**Then** they appear as proposal defaults only  
**And** do not write to committed row until accepted.

### TXN-006 — Carry-Forward Is Proposal Only

**Given** personnel carry-forward values  
**Then** they appear as proposal defaults only  
**And** do not write to committed row until accepted.

---

## 7. Schema and Validation Tests

### SCHEMA-001 — Required Scaffold Fields

A valid committed play must include:

```text
playNum, qtr, odk
```

### SCHEMA-002 — ODK Enum

Allowed values:

```text
O, D, K, S
```

Invalid values should block or flag commit.

### SCHEMA-003 — Down Enum

Allowed values:

```text
1, 2, 3, 4
```

### SCHEMA-004 — Hash Enum

Allowed values:

```text
L, M, R
```

### SCHEMA-005 — Grade Range

Allowed values:

```text
-3, -2, -1, 0, 1, 2, 3
```

### SCHEMA-006 — Canonical Personnel Slots

Only these canonical slots are active for offensive personnel:

```text
LT, LG, C, RG, RT, Y, X, 1, 2, 3, 4
```

---

## 8. Lookup Governance Tests

### LOOKUP-001 — Known Formation Resolves Dependents

**Given** known `offForm`  
**Then** `offStrength` and `personnel` resolve from lookup  
**And** appear in proposal before commit.

### LOOKUP-002 — Unknown Formation Blocks Commit

**Given** unknown `offForm`  
**Then** governance interrupt appears  
**And** committed row is unchanged.

### LOOKUP-003 — New Formation Requires Dependents

New formation append requires:

```text
canonical label, offStrength, personnel
```

### LOOKUP-004 — Known Play Resolves Dependents

**Given** known `offPlay`  
**Then** `playType` and `playDir` resolve from lookup.

### LOOKUP-005 — New Play Requires Dependents

New play append requires:

```text
canonical label, playType, playDir
```

### LOOKUP-006 — Known Motion Resolves Direction

**Given** known `motion`  
**Then** `motionDir` resolves from lookup.

### LOOKUP-007 — New Motion Requires Direction

New motion append requires:

```text
canonical label, motionDir
```

### LOOKUP-008 — Multiple Unknowns Preserve Context

**Given** narration includes unknown formation, play, and motion  
**When** each is resolved  
**Then** no candidate value is lost  
**And** final proposal contains all resolved values and dependents.

### LOOKUP-009 — Near-Duplicate Warning

**Given** candidate `Black Formation` and existing `Black`  
**Then** near-duplicate warning appears before append.

---

## 9. Roster / Off-Roster Tests

### ROSTER-001 — Off-Roster Jersey Detected

**Given** Pass 2 assignment `posY = 84` and #84 is not in roster  
**Then** off-roster issue is shown for slot Y.

### ROSTER-002 — Roster Add Preserves Assignment

**Given** `posY = 84` is off-roster  
**When** coach adds #84 to roster  
**Then** proposal still retains `posY = 84`.

### ROSTER-003 — Correct Jersey Updates Intended Field Only

**Given** off-roster issue on `posY`  
**When** coach corrects jersey to #82  
**Then** only `posY` changes.

### ROSTER-004 — Clear Assignment Clears Intended Field Only

**Given** off-roster issue on `posY`  
**When** coach clears assignment  
**Then** only `posY` clears.

### ROSTER-005 — Roster Update Does Not Rewrite History

**Given** historical committed plays  
**When** roster is updated  
**Then** historical committed rows are unchanged.

---

## 10. Pass 1 Workflow Tests

### P1-001 — Basic Play Commit

**Given** valid Pass 1 proposal  
**When** coach commits  
**Then** Pass 1 fields write to the committed row  
**And** audit event is created where supported.

### P1-002 — Ball Carrier Phrase Maps to Rusher

**Given** narration:

```text
number three was the ball carrier
```

**Then** proposal includes:

```text
rusher = 3
```

### P1-003 — Self-Correction Uses Latest Clear Value

**Given** narration:

```text
we got 3, no 4 yards
```

**Then** proposal includes:

```text
gainLoss = 4
```

### P1-004 — Unknown Lookup Does Not Commit

**Given** narration includes unknown `offForm`  
**Then** commit is blocked or field remains unresolved until lookup governance completes.

### P1-005 — Commit & Next Advances After Commit

**Given** valid Pass 1 proposal  
**When** coach clicks Commit & Next  
**Then** current proposal commits  
**And** next slot opens  
**And** next slot is not silently committed.

---

## 11. Pass 2 Workflow Tests

### P2-001 — Personnel Slots Render Canonically

Pass 2 shows:

```text
LT, LG, C, RG, RT, Y, X, 1, 2, 3, 4
```

### P2-002 — Alias Does Not Change Canonical Slot

**Given** display alias `Z` maps to slot `1`  
**When** coach assigns `Z = 11`  
**Then** proposal uses:

```text
pos1 = 11
```

**And** export label remains:

```text
1
```

### P2-003 — Empty Slot Seeds from Prior Complete Personnel

**Given** current play has no committed personnel  
**And** prior committed offensive play has complete personnel  
**When** current Pass 2 slot opens  
**Then** proposal seeds personnel from prior play  
**And** provenance is carry-forward.

### P2-004 — Seed Does Not Overwrite Committed Personnel

**Given** current play already has committed personnel  
**When** Pass 2 slot opens  
**Then** committed values are preserved.

### P2-005 — Commit & Next Uses Same Seeding Policy

**Given** Pass 2 Commit & Next opens the next slot  
**Then** it uses the same carry-forward source as seed-on-open.

### P2-006 — Duplicate Jersey Detection

**Given** same jersey assigned to two personnel slots  
**Then** duplicate warning appears.

### P2-007 — Pass 2 Does Not Mutate Pass 1 Fields

**Given** Pass 2 personnel edit  
**When** committed  
**Then** Pass 1 fields are unchanged unless explicitly touched through overwrite flow.

---

## 12. Pass 3 Workflow Tests

### P3-001 — Pass 3 Panel Appears Only in Pass 3

**Given** active pass is not Pass 3  
**Then** grading panel is hidden.

### P3-002 — Manual Grade Uses Proposal Path

**Given** manual grade edit  
**Then** value appears in proposal  
**And** requires commit.

### P3-003 — Narrated Grade Uses Proposal Path

**Given** narrated grade edit  
**Then** value appears in proposal  
**And** requires commit.

### P3-004 — Collapsed Y1 Parses Correctly

**Given** Pass 3 narration:

```text
Y1
```

**Then** proposal includes:

```text
gradeY = 1
```

### P3-005 — Go To Normalizes in Grade Context

**Given** Pass 3 narration:

```text
Y go to one
```

**Then** system may normalize as:

```text
gradeY = 1
```

### P3-006 — Out-of-Range Grade Blocks or Flags

**Given** grade value `4`  
**Then** validation blocks or flags the value.

### P3-007 — Pass 3 Does Not Mutate Pass 1 or Pass 2

**Given** Pass 3 grade commit  
**Then** Pass 1 metadata and Pass 2 personnel are unchanged unless explicitly touched through overwrite flow.

---

## 13. Parser / Narration Tests

### PARSER-001 — Parser Output Is Proposal Only

Parser output never writes committed row without explicit commit.

### PARSER-002 — Pass Scoping Enforced

Pass 3 parser does not update Pass 1 fields by default.

### PARSER-003 — Multiple Values in One Narration

Narration with down, distance, formation, motion, play, actor, and gain/loss produces a coherent proposal without losing fields.

### PARSER-004 — Ambiguous Actor Is Not Silently Assigned

**Given** narration:

```text
84 made a good play
```

**Then** parser does not silently set `receiver = 84`.

### PARSER-005 — AI May Challenge Parser-Filled Governed Values

**Given** Play Details narration:

```text
The play is 39 Reverse Pass from Shiny formation.
```

**And** deterministic parsing incorrectly proposes:

```text
offPlay = 39 Reverse
offForm = Pass From Shiny
```

**Then** AI crosscheck may flag both assignments as suspicious  
**And** may propose:

```text
offPlay = 39 Reverse Pass
offForm = Shiny
```

**And** must not infer motion.

**And** any correction must enter proposal/collision/governance flow before commit.

### PARSER-006 — AI Receives Section Intent

**Given** the word `Trips` appears in Play Details  
**And** `Trips` exists in the `offForm` lookup  
**Then** the system may treat it as strong `offForm` evidence.

**Given** the word `Trips` appears in Situation  
**Then** the system must not treat it as `offForm` evidence merely because it exists in lookup.

### PARSER-007 — Exact Lookup Match Beats Fuzzy Novel Creation

**Given** Play Details narration contains a known lookup value  
**When** AI interpretation runs  
**Then** exact lookup evidence should be preferred over fuzzy matching or novel value creation.

**And** the value must still remain proposal data until commit.

### PARSER-008 — AI Cannot Bypass Lookup Governance

**Given** AI proposes a new governed value:

```text
offForm = Shiny
```

**And** `Shiny` is not in the active season lookup store  
**Then** lookup governance must block commit until the coach adds, maps, corrects, clears, or rejects the value.

### PARSER-009 — AI No-Evidence Suppresses Hallucinated Motion

**Given** Play Details narration:

```text
The play is 39 Reverse Pass from Shiny formation.
```

**Then** AI should return no motion proposal unless motion is explicitly mentioned or strongly matched from motion lookup evidence.

**And** no motion governance modal should appear for this narration.

### PARSER-010 — Parser Suspicion for Overlong Governed Values

**Given** parser proposes a governed lookup value with cue words or sentence fragments, such as:

```text
Pass From Shiny
Door Open And
We Are In Trips
```

**Then** the system should flag the value as suspicious  
**And** either normalize it, ask AI to crosscheck it, or surface a review warning before lookup append.

### PARSER-011 — AI Corrections Use Collision / Overwrite Path

**Given** a field already has a non-empty value  
**And** AI proposes a different value for the same field  
**Then** the system must use the existing collision/overwrite review path  
**And** must not silently replace the value.

### PARSER-012 — AI Context Includes Football and STT Guidance

**Given** AI section interpretation is invoked  
**Then** the prompt/context must identify the task as American football play logging  
**And** include section intent, owned fields, current candidate values, deterministic parser patch, lookup evidence, and known speech-to-text confusions.

---

## 14. UX Acceptance Tests

### UX-001 — Active Play Visible

Active play number is visible while editing/logging.

### UX-002 — Active Pass Visible

Active pass is visible and visually distinct.

### UX-003 — Proposal and Commit Are Visually Distinct

Proposed values and committed values are not visually identical.

### UX-004 — Provenance Visible Where Useful

Seeded, predicted, lookup-derived, parser-derived, and AI-derived values show provenance where useful.

### UX-005 — Dropdown Dismissal

Lookup suggestion dropdowns dismiss when clicking outside across passes.

### UX-006 — Lookup Interrupt Has Escape Path

Unknown lookup modal/interruption allows add, correct/map, leave blank/reject, or exit/pause.

### UX-007 — Commit Button Labels Match Behavior

Buttons labeled Commit commit. Buttons labeled Next navigate. Commit & Next does both in that order.

---

## 15. Persistence and Audit Tests

### AUDIT-001 — Commit Audit Event

Material play commit creates audit event where audit is supported.

### AUDIT-002 — Lookup Append Audit Event

Lookup append creates lookup audit event where audit is supported.

### AUDIT-003 — Roster Add Audit Event

Roster add creates roster audit event where audit is supported.

### AUDIT-004 — Export Does Not Count as Commit

Export action must not alter play commit audit state.

---

## 16. Manual Regression Script

Use this when automated tests are not yet present or not comprehensive.

### Script A — Pass 1 Basic Logging

1. Open a new/offensive play slot.
2. Narrate a basic run play.
3. Confirm proposal shows down, distance, formation, play, rusher, gain/loss.
4. Commit.
5. Export CSV.
6. Confirm row appears with correct Hudl headers.

### Script B — Pass 2 Carry-Forward

1. Commit full personnel on Play 1.
2. Open Pass 2 for Play 2 with empty personnel.
3. Confirm personnel seeds from Play 1 as proposal/carry-forward.
4. Commit Play 2 personnel.
5. Open Play 3 through Commit & Next.
6. Confirm same seeding policy applies.

### Script C — Off-Roster Resolution

1. Assign an off-roster jersey to Y.
2. Confirm off-roster warning shows jersey and slot.
3. Add player to roster.
4. Confirm Y assignment remains intact.
5. Commit.

### Script D — Pass 3 Grade Narration

1. Switch to Pass 3.
2. Narrate `Y1, LT minus one, C zero`.
3. Confirm proposal maps values correctly.
4. Commit.
5. Confirm Pass 1 and Pass 2 fields are unchanged.

### Script E — Export Contract

1. Create at least one committed play with Pass 1, Pass 2, and Pass 3 values.
2. Export Hudl Plays CSV.
3. Confirm exact header count/order.
4. Confirm `1`, `2`, `3`, `4` headers exist.
5. Confirm `POS 1`, `POS 2`, `POS 3`, `POS 4` headers do not exist.

---

## 17. Lovable Patch Acceptance Rule

Every Lovable patch request should include:

1. target behavior
2. files/area to inspect if known
3. explicit non-goals
4. acceptance tests from this spec
5. “do not change Hudl export headers” if near schema/export work

Example:

```text
Fix Pass 2 seed-on-open only.
Acceptance: P2-003, P2-004, P2-005.
Do not change Pass 1 parser behavior.
Do not change Hudl export headers.
Do not rename canonical fields.
```

---

## 18. Open Issues / Review Items

| ID | Issue | Recommendation |
|---|---|---|
| TEST-001 | Need map of existing automated tests | Ask Lovable to inspect only |
| TEST-002 | Need determine best test harness for parser fixtures | Inspect existing setup first |
| TEST-003 | Need export header automated test if not present | High priority |
| TEST-004 | Need Pass 2 seeding regression test | High priority |
| TEST-005 | Need off-roster preservation regression test | High priority |
| TEST-006 | Need Pass 3 `Y1` and `go to` regression tests | Medium/high priority |

---

## 19. Final Operating Rule

A passing test suite should prove the system keeps its promises.

No silent commits. No schema drift. No phantom overwrites. No export surprises. No owl pellets in the Hudl CSV.
