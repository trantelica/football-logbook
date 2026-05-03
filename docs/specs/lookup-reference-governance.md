# Football Engine — Lookup & Reference Governance Spec

**Version:** v2.0 draft  
**Status:** Working spec  
**Primary purpose:** govern canonical lookup/reference values without weakening the deterministic proposal/commit model.  
**Canonical owner:** product owner / coach  
**Implementation owner:** Lovable / code implementation agents  
**Repo path:** `docs/specs/lookup-reference-governance.md`

---

## 1. Conclusion

Lookup and reference governance protects the Football Engine from vocabulary drift.

Governed values such as formations, plays, motions, penalties, roster jerseys, personnel assignments, and dependent fields must pass through deterministic reference rules before they can enter committed play rows.

Lookup governance sits between candidate parsing and proposal validation:

```text
candidate → lookup/reference governance → proposal → validate → commit → audit
```

Lookup governance may provide canonical values to a proposal patch. It must not mutate committed play rows directly.

---

## 2. Non-Negotiables

1. Unknown governed values must not silently enter committed rows.
2. New canonical lookup values require explicit coach confirmation.
3. Dependent fields must be collected before confirming a new governed value.
4. Lookup-derived values are visible proposal values, not hidden writes.
5. Lookup governance must not bypass proposal review.
6. Lookup governance must not mutate committed rows directly.
7. Lookup changes must not rewrite historical committed rows silently.
8. Roster changes must not rewrite historical committed rows silently.
9. Display aliases and synonyms are helpers, not canonical schema keys.
10. Export uses canonical values only.

---

## 3. Scope

This spec governs:

1. offensive formation governance
2. offensive play governance
3. motion governance
4. dependent lookup fields
5. penalty governance
6. roster governance
7. off-roster handling
8. synonyms and aliases
9. lookup append workflows
10. near-duplicate protection
11. lookup versioning
12. lookup audit events
13. maintenance mode vs logging interrupt behavior

This spec does not define:

1. full UI copy
2. parser grammar
3. export header shape
4. full transaction engine implementation
5. future defensive lookup tables beyond activation rules

---

## 4. Governed Reference Categories

| Category | Status | Maintainer | Notes |
|---|---|---|---|
| Offensive formations | Active | coach-maintainable | governs `offStrength`, `personnel` |
| Offensive plays | Active | coach-maintainable | governs `playType`, `playDir` |
| Motions | Active / maturing | coach-maintainable | governs `motionDir` |
| Roster | Active | coach-maintainable | governs jersey/player references |
| Penalties | Active | system-maintained | non-maintainable fixed enum |
| Defensive fronts | Future / inactive | future coach-maintainable | Pass 4+ |
| Coverages | Future / inactive | future coach-maintainable | Pass 4+ |
| Blitzes | Future / inactive | future coach-maintainable | Pass 4+ |

---

## 5. Canonical Lookup Concepts

### 5.1 Canonical Value

The official value stored and exported.

Example:

```text
Trips Right
```

### 5.2 Raw Value

The phrase captured from input before governance.

Example:

```text
trips rt
```

### 5.3 Synonym

An approved alternate phrase that maps to a canonical value.

Example:

```text
Trips Rt → Trips Right
```

### 5.4 Dependent Fields

Fields governed by the canonical lookup value.

Example:

```text
OFF FORM = Trips Right
OFF STR = R
PERSONNEL = 11
```

### 5.5 Alias

A display or translation helper that should not alter canonical schema keys.

Example:

```text
Z → canonical slot 1 → internal key pos1 → export label 1
```

---

## 6. Governed Field Matrix

### 6.1 Offensive Formation

| Governing Field | Export Label | Required Dependent Fields | Notes |
|---|---|---|---|
| `offForm` | `OFF FORM` | `offStrength`, `personnel` | coach-maintainable |

Allowed `offStrength` values:

```text
L, BAL, R
```

Allowed `personnel` values:

```text
11, 12, 13, 21, 22, 23, 31, 32, 41, 50
```

### 6.2 Offensive Play

| Governing Field | Export Label | Required Dependent Fields | Notes |
|---|---|---|---|
| `offPlay` | `OFF PLAY` | `playType`, `playDir` | coach-maintainable |

Allowed `playDir` values:

```text
L, M, R
```

Allowed `playType` values:

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

### 6.3 Motion

| Governing Field | Export Label | Required Dependent Fields | Notes |
|---|---|---|---|
| `motion` | `MOTION` | `motionDir` | coach-maintainable |

Allowed `motionDir` values:

```text
L, R
```

### 6.4 Penalty

| Governing Field | Export Label | Dependent Fields | Notes |
|---|---|---|---|
| `penalty` | `PENALTY` | `penYards` where applicable | fixed / non-maintainable |

Penalty values are not coach-maintainable in the current spec. Coach may select from fixed values only.

---

## 7. Lookup Store Model

Conceptual lookup store shape:

```ts
type LookupStore = {
  version: string;
  formations: FormationLookupEntry[];
  plays: PlayLookupEntry[];
  motions: MotionLookupEntry[];
};
```

### 7.1 Formation Entry

```ts
type FormationLookupEntry = {
  canonical: string;
  offStrength: "L" | "BAL" | "R";
  personnel: string;
  synonyms: string[];
  createdAt: string;
  createdBySessionId?: string;
  updatedAt?: string;
};
```

### 7.2 Play Entry

```ts
type PlayLookupEntry = {
  canonical: string;
  playType: string;
  playDir: "L" | "M" | "R";
  synonyms: string[];
  createdAt: string;
  createdBySessionId?: string;
  updatedAt?: string;
};
```

### 7.3 Motion Entry

```ts
type MotionLookupEntry = {
  canonical: string;
  motionDir: "L" | "R";
  synonyms: string[];
  createdAt: string;
  createdBySessionId?: string;
  updatedAt?: string;
};
```

Exact implementation keys may vary. The governed concepts must remain intact.

---

## 8. Matching Rules

Lookup matching should be deterministic and ordered.

Given candidate token `T`:

1. exact canonical match
2. case-insensitive canonical match
3. normalized canonical match
4. exact synonym match
5. case-insensitive synonym match
6. normalized synonym match
7. no match → unknown governed value

Normalization may include:

- trim whitespace
- collapse repeated spaces
- normalize punctuation
- normalize common abbreviations where approved

Fuzzy matching may suggest candidates but must never auto-apply canonical values.

---

## 9. Unknown Governed Value Flow

When a governed value is unknown:

```text
candidate value → UNKNOWN → governance interrupt → append/correct/reject → rerun normalization → proposal
```

### 9.1 Required Coach Choices

The coach must be able to choose:

1. add as new canonical value
2. correct to an existing canonical value
3. reject / leave blank
4. exit play logging / pause

### 9.2 Blocking Policy

Unknown governed values should block valid proposal/commit for that governed field until resolved.

If lenient behavior is ever allowed, it must be explicit and documented. Lenient mode must not silently insert raw unknown values into committed rows.

---

## 10. Append Workflow

### 10.1 Formation Append

When adding a new formation, the coach must provide:

1. canonical formation label
2. offensive strength
3. personnel group
4. optional synonyms

The system must:

1. check for exact duplicate
2. check for near duplicate
3. require confirmation
4. persist only after confirmation
5. version/audit the append
6. rerun normalization
7. feed canonical value and dependents into proposal

### 10.2 Play Append

When adding a new offensive play, the coach must provide:

1. canonical play label
2. play type
3. play direction
4. optional synonyms

### 10.3 Motion Append

When adding a new motion, the coach must provide:

1. canonical motion label
2. motion direction
3. optional synonyms

### 10.4 Append Naming Hygiene

Canonical labels should be football labels, not verbose descriptions.

Bad:

```text
Black Formation
```

Better:

```text
Black
```

Bad:

```text
26 Punch Play
```

Better:

```text
26 Punch
```

The system should avoid adding redundant words like `formation`, `play`, or `motion` unless they are truly part of the team’s canonical terminology.

---

## 11. Near-Duplicate Protection

Near-duplicate detection protects the lookup store from slow vocabulary rot.

Examples:

| Candidate | Existing | Risk |
|---|---|---|
| `Trips Rt` | `Trips Right` | likely synonym, not new canonical |
| `Black Formation` | `Black` | redundant suffix |
| `26 punch` | `26 Punch` | case-only duplicate |
| `38-Punch` | `38 Punch` | punctuation duplicate |

Near-duplicate behavior:

1. show possible matches
2. explain the risk simply
3. let coach map to existing value or confirm new canonical
4. never auto-merge silently

---

## 12. Roster Governance

Roster governance maps jersey numbers to player identities.

Conceptual roster entry:

```ts
type RosterEntry = {
  jersey: number;
  playerName: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
};
```

Roster governs:

1. Pass 2 personnel slots
2. actor fields such as `rusher`, `passer`, `receiver`
3. future kicking actors such as `kicker`, `returner`

Roster governance must not change the canonical Hudl export shape. Exports use jersey numbers.

---

## 13. Off-Roster Handling

When a jersey appears that is not in the roster, the system should detect it and preserve assignment intent.

### 13.1 Off-Roster Report

The system may produce an off-roster report:

```ts
type OffRosterReportEntry = {
  jersey: number;
  fieldKey: string;
  slotLabel?: string;
  status: "off_roster" | "matched" | "resolved";
};
```

### 13.2 Resolution Flow

The coach may:

1. add jersey/player to roster
2. correct the jersey number
3. clear the assignment
4. proceed according to validation policy

### 13.3 Assignment Preservation Rule

If the coach adds an off-roster jersey to the roster, the system must preserve the original slot assignment context.

Example:

```text
posY = 84 is off-roster
coach adds #84 as Stevens
proposal should still retain posY = 84
```

The roster resolution flow must not discard the intended personnel assignment.

---

## 14. Actor Membership Governance

Actor membership links Pass 1 actors to Pass 2 personnel.

Relevant fields:

- `rusher`
- `passer`
- `receiver`
- future `kicker`
- future `returner`

Rules:

1. Actor fields store jersey numbers.
2. Actor fields should be roster-valid when roster exists.
3. Actor fields may need to be personnel-valid for offensive plays.
4. Actor membership warnings should be actionable.
5. Actor membership validation must not silently rewrite personnel or actors.

---

## 15. Alias Governance

Aliases are allowed only as display/translation helpers.

Personnel alias example:

```text
Z → canonical slot 1 → internal key pos1 → Hudl export label 1
```

Alias rules:

1. aliases do not change stored keys
2. aliases do not change export labels
3. aliases do not create schema keys
4. aliases may help parse coach narration
5. aliases may help display team-specific terminology
6. aliases must map back to canonical slots before proposal/commit

---

## 16. Versioning Rules

Lookup/reference stores should use versioning independent of app version and export format version.

Recommended version types:

| Version | Purpose |
|---|---|
| `lookupVersion` | lookup/reference vocabulary state |
| `schemaVersion` | canonical data contract version |
| `exportFormatVersion` | Hudl export format version |
| `appVersion` | application release version |

Recommended lookup version bumps:

| Change | Version Impact |
|---|---|
| synonym added | patch |
| new canonical value added | minor |
| dependent field corrected | minor or major, depending on policy |
| lookup shape changed | major |
| canonical value deleted or merged | major / explicit migration |

Canonical deletion/merge should be rare and must not rewrite history silently.

---

## 17. Audit Requirements

Lookup/reference governance should create audit events for material changes.

Required audit event types:

| Event | Trigger |
|---|---|
| `LOOKUP_APPEND_CONFIRMED` | new canonical lookup value added |
| `LOOKUP_SYNONYM_ADDED` | synonym added |
| `LOOKUP_DEPENDENTS_UPDATED` | dependent fields changed |
| `ROSTER_ADD` | roster player added |
| `ROSTER_UPDATE` | roster player updated |
| `ROSTER_RESOLUTION` | off-roster jersey resolved |

Audit event should capture:

1. event id
2. timestamp
3. event type
4. affected lookup category
5. canonical value or jersey
6. prior value, where applicable
7. new value
8. session id, where available

---

## 18. Maintenance Mode vs Logging Interrupt

Lookup/reference values may be maintained in two contexts.

### 18.1 Maintenance Mode

Used before or outside play logging.

Examples:

- entering initial playbook
- entering formation library
- entering motion library
- entering roster

Maintenance mode should not be mixed visually with active play commit state.

### 18.2 Logging Interrupt

Used during active play logging when the coach says an unknown governed value.

Rules:

1. interrupt should be narrow
2. preserve current play context
3. preserve current candidate/proposal evidence
4. after resolution, rerun normalization
5. return to the proposal flow
6. do not commit the play until the coach explicitly accepts

---

## 18.3 Season Scoping of Lookup / Reference Stores

Lookup and reference stores are **season-scoped**. They are not global, and they do not silently span seasons.

### 18.3.1 Persistence Within a Season

1. A lookup/reference store persists session-to-session within the same season.
2. All sessions/games created under the active season share that season's lookup store (formations, plays, motions, roster, synonyms, dependent fields).
3. Lookup append, synonym addition, and roster updates made during any session in the season mutate the active season's store and remain available to subsequent sessions in that same season.
4. Lookup versioning (`lookupVersion`, audit events, near-duplicate checks) applies within the active season's store.

### 18.3.2 New Season Initialization

1. Starting a new season MUST initialize a distinct lookup/reference store for that season.
2. A new season MUST NOT automatically inherit formations, plays, motions, synonyms, dependent field mappings, or roster entries from any prior season.
3. The new season's store begins empty, or is explicitly initialized by the coach (e.g., from a chosen import source).
4. Prior-season canonical values, synonyms, and roster jerseys MUST NOT resolve in the new season unless they have been explicitly imported into that season's store.

### 18.3.3 Cross-Season Reuse

Reuse of prior-season lookup/reference data is allowed only through an explicit, coach-initiated action:

1. export of a prior season's lookup/reference store
2. import into the active season's lookup/reference store
3. or an equivalent migration action explicitly selected by the coach

Cross-season reuse rules:

1. The action must be explicit. No implicit cross-season fallthrough.
2. The action must be reviewable. The coach must see what is being brought into the new season before it is persisted.
3. Imported entries enter the new season's store as that season's own canonical values. They do not retain a live link back to the source season.
4. Import must not mutate the source season's store.
5. Import must produce audit events in the destination season per Section 17.

### 18.3.4 Session Metadata Reference

Each session/game should record the identity and version of the season lookup/reference store that was active during that session:

1. season identifier
2. season lookup store identifier (where applicable)
3. lookup store version at session start
4. lookup store version at session end (if changed during the session)

This makes it possible to explain, after the fact, which vocabulary state governed a given session's commits.

### 18.3.5 What This Section Does Not Change

1. Hudl export headers are unchanged.
2. Canonical field names are unchanged.
3. Parser behavior is unchanged.
4. This section does not specify the implementation of import/export or migration actions; it only specifies that such actions must be explicit, reviewable, coach-initiated, and audited.

---

## 19. Error Handling

Lookup/reference errors should be specific and actionable.

Examples:

| Situation | Preferred Message Direction |
|---|---|
| unknown formation | “Formation not found. Add it, map it to an existing formation, or leave it blank.” |
| duplicate play | “This looks like an existing play. Choose existing or confirm a new canonical value.” |
| missing dependent field | “Choose play type before adding this play.” |
| off-roster jersey | “#84 is not on the roster. Add player, correct jersey, or clear assignment.” |

Errors should not imply the coach did something wrong. Vocabulary governance is a guardrail, not a scolding owl.

---

## 20. Implementation Guardrails for Lovable

### 20.1 Good Inspect Request

```text
Inspect lookup governance only. Do not modify code.
Report current behavior for OFF FORM, OFF PLAY, MOTION, roster/off-roster handling, and lookup append persistence.
Separate implemented behavior from missing behavior.
Do not recommend broad refactors.
```

### 20.2 Good Patch Request

```text
Make the smallest targeted patch to the lookup append flow.
Unknown governed values must not enter committed rows silently.
After append confirmation, rerun normalization and return the canonical value plus dependent fields to the proposal.
Do not alter Hudl export headers.
Do not alter unrelated parser behavior.
Add or update focused regression tests where available.
```

### 20.3 Bad Request

```text
Improve lookup governance and clean up reference handling.
```

Too broad. It invites bug confetti.

---

## 21. Acceptance Criteria

### 21.1 Lookup Matching

The system passes if:

1. exact canonical matches resolve correctly
2. case-insensitive matches resolve correctly
3. normalized matches resolve correctly
4. synonym matches resolve correctly
5. unknown governed values trigger governance flow
6. fuzzy suggestions do not auto-apply

### 21.2 Lookup Append

The system passes if:

1. unknown `offForm` requires dependent `offStrength` and `personnel`
2. unknown `offPlay` requires dependent `playType` and `playDir`
3. unknown `motion` requires dependent `motionDir`
4. new canonical values are persisted only after confirmation
5. duplicate/near-duplicate warnings appear before append
6. append creates audit event
7. append increments lookup version according to policy
8. proposal receives canonical value and dependents after append
9. play still requires explicit commit

### 21.3 Roster / Off-Roster

The system passes if:

1. off-roster jerseys are detected
2. adding a roster player preserves assignment context
3. correcting jersey updates the proposal field
4. clearing assignment clears only the intended field
5. roster updates do not rewrite historical committed rows
6. actor fields remain jersey-based for export

### 21.4 Alias / Synonym

The system passes if:

1. synonyms map to canonical lookup values
2. aliases map to canonical personnel slots
3. aliases do not change export labels
4. aliases do not create schema keys
5. display changes do not mutate committed rows

---

## 22. Open Issues / Review Items

| ID | Issue | Recommendation |
|---|---|---|
| LRG-001 | Confirm current MOTION governance maturity versus OFF FORM/OFF PLAY | Inspect before patching |
| LRG-002 | Confirm lookup store version behavior currently exists or is aspirational | Classify implementation gap |
| LRG-003 | Confirm audit event coverage for lookup append and roster add | Inspect before patching |
| LRG-004 | Confirm near-duplicate detection current behavior | Inspect before patching |
| LRG-005 | Confirm off-roster resolution updates snapshot/report state after roster add | Keep as regression case |
| LRG-006 | Decide whether lenient mode should exist at all | Default to strict for governed values |

---

## 23. Final Operating Rule

Reference data is the vocabulary spine of the Football Engine.

Let the coach evolve language deliberately. Never let the system smuggle new vocabulary into the ledger under a trench coat.
