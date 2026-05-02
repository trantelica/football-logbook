# Football Engine — Session Scaffolding & Carry-Forward Spec

**Version:** v2.0 draft  
**Status:** Working spec  
**Primary purpose:** define game/session slot creation, scaffolded fields, and carry-forward/seed behavior without allowing silent committed-data mutation.  
**Canonical owner:** product owner / coach  
**Implementation owner:** Lovable / code implementation agents  
**Repo path:** `docs/specs/session-scaffolding-and-carry-forward.md`

---

## 1. Conclusion

Session scaffolding and carry-forward are convenience systems. They are not commit systems.

Scaffolding may create the basic logging frame for a game/session. Carry-forward may seed likely repeated values into a proposal. Neither may silently overwrite committed data or change the canonical Hudl export contract.

The governing rule is:

```text
system default → visible proposal/scaffold → coach review where applicable → explicit commit
```

For committed play-row data, the core architecture still controls:

```text
candidate → proposal → validate → commit → audit
```

---

## 2. Why This Spec Exists

Two behaviors are easy to under-specify:

1. **Game/session scaffolding**: creating play slots, quarter/ODK/series defaults, and the initial logging frame.
2. **Carry-forward / seeding**: copying prior committed context, especially Pass 2 personnel, into the next play as visible defaults.

Both improve speed. Both can corrupt trust if they silently write or overwrite data.

---

## 3. Non-Negotiables

1. Scaffolding must not create hidden play metadata beyond its defined scope.
2. Carry-forward values are proposal defaults only.
3. Carry-forward must be visible before commit.
4. Carry-forward must not overwrite committed values.
5. Seed-on-open and Commit & Next must use the same policy for the same workflow.
6. Scaffolding changes after logging begins must not silently rewrite committed plays.
7. Series/quarter/ODK defaults must be inspectable and correctable.
8. Segment rows must remain distinguishable from true football plays.
9. Export reads committed rows only.
10. No scaffold or seed action may bypass validation/commit.

---

## 4. Definitions

| Term | Meaning |
|---|---|
| Session | One film logging workspace for a game or film segment |
| Slot | A numbered play/logging position, usually tied to `playNum` |
| Scaffold | System-created starter structure for slots and basic required context |
| Seed | A visible default inserted into proposal state |
| Carry-forward | A seed copied from prior committed play context |
| Commit | Explicit accepted write into the committed play row |
| Segment row | `ODK = S` row used for indexing/film artifact context, not a normal analytic play |

---

## 5. Scaffolded Field Inventory

The current scaffoldable fields are:

| Field | Export Label | Scaffold Role | Commit Behavior |
|---|---|---|---|
| `playNum` | `PLAY #` | slot identity | should be stable after slot creation |
| `qtr` | `QTR` | game/segment context | visible/correctable |
| `odk` | `ODK` | row/play type context | visible/correctable |
| `series` | `SERIES` | offensive series grouping | visible/correctable or logic-derived |

Fields such as `yardLn`, `dn`, `dist`, `offForm`, `offPlay`, `motion`, personnel, and grades are not scaffold fields. They may be predicted, carried forward, parsed, manually entered, or lookup-derived, but they are not basic session scaffold defaults.

---

## 6. Game / Session Initialization

### 6.1 Purpose

Session initialization creates enough structure for the coach to begin logging film.

It may define:

1. field size
2. game/session label
3. team/context metadata
4. initial play slots
5. quarter blocks
6. ODK blocks
7. segment rows where needed
8. initial series values where safely derivable

### 6.2 Initialization Must Not

Session initialization must not:

1. fill play metadata such as formation, play, result, or gain/loss
2. fill personnel values
3. fill grade values
4. infer actors
5. create lookup values
6. silently mark future plays as complete

---

## 7. Play Slot Creation

### 7.1 `playNum`

`playNum` is the durable slot identity.

Rules:

1. `playNum` must be unique within a session.
2. `playNum` must export in ascending order.
3. `playNum` should not be reused for a different play once committed.
4. Renumbering, if ever supported, requires explicit design and audit policy.

### 7.2 Empty Slots

An empty slot may exist before any play metadata is committed.

An empty slot may contain scaffolded context, but must not be treated as a complete play.

---

## 8. Quarter (`qtr`) Scaffolding

Allowed values:

```text
1, 2, 3, 4, 5
```

`5` represents overtime.

Rules:

1. `qtr` may be scaffolded from session setup or segment boundaries.
2. `qtr` must remain visible and correctable.
3. Correcting `qtr` on one committed row must not silently cascade to other committed rows.
4. Bulk quarter changes, if ever supported, require explicit review and audit.

---

## 9. ODK Scaffolding

Allowed values:

```text
O, D, K, S
```

Meanings:

| Value | Meaning |
|---|---|
| O | offense |
| D | defense |
| K | kicking / special teams |
| S | segment/index row |

Rules:

1. `odk` may be scaffolded from session structure.
2. `odk` controls which workflow/pass behavior is applicable.
3. `ODK = S` rows are not normal football plays.
4. Changing `odk` after data has been committed may affect validation and should require explicit review.
5. `odk` changes must not silently clear fields.

---

## 10. Series Scaffolding

`series` groups offensive possessions or offensive logging sequences.

Rules:

1. `series` may be scaffolded or logic-derived.
2. `series` should increment on possession change or new offensive series where that event is known.
3. `series` must not be recalculated across historical committed plays silently.
4. Editing a prior row must not silently renumber downstream committed series.
5. If series confidence is low, leave blank or require coach confirmation.

### 10.1 Current Safe Series Policy

Until a full possession model is explicitly specified, series should remain conservative.

Safe behavior:

```text
scaffold visible series values when known; do not auto-rewrite historical series after edits
```

Unsafe behavior:

```text
recalculate all later series numbers after a prior correction without review
```

---

## 11. Segment Rows (`ODK = S`)

Segment rows are used for indexing or film structure. They are not complete football play rows.

Minimum expected fields:

```text
playNum, qtr, odk
```

Rules:

1. Segment rows should not require Pass 1 play metadata.
2. Segment rows should not participate in offensive prediction as normal prior plays.
3. Segment rows should not be used as carry-forward source plays.
4. Segment rows export under the same header contract but may have many blank fields.

---

## 12. Carry-Forward Field Inventory

Current canonical carry-forward fields are Pass 2 offensive personnel slots:

```text
posLT, posLG, posC, posRG, posRT, posY, posX, pos1, pos2, pos3, pos4
```

Export labels:

```text
LT, LG, C, RG, RT, Y, X, 1, 2, 3, 4
```

Carry-forward does not currently govern Pass 1 play metadata or Pass 3 grades.

---

## 13. Carry-Forward Source Policy

For Pass 2 personnel, the source should be:

```text
the most recent prior committed offensive play with complete personnel
```

### 13.1 Source Requirements

A source play must:

1. be prior to the current play number
2. be committed
3. have `odk = O`
4. not be a segment row
5. have all eleven canonical personnel slots populated
6. pass duplicate/off-roster validation according to current policy

### 13.2 Complete Personnel Definition

Complete personnel means all fields are present:

```text
posLT, posLG, posC, posRG, posRT, posY, posX, pos1, pos2, pos3, pos4
```

A partially completed prior play should not be treated as the standard carry-forward source unless a future spec defines partial-source behavior.

---

## 14. Carry-Forward Application Policy

Carry-forward may apply only when the current personnel target is empty or uncommitted.

Rules:

1. If current play has committed personnel, do not seed over it.
2. If current play has an active manually edited proposal, do not overwrite it without confirmation.
3. If current play has no personnel values, seed all eleven slots from the source play.
4. Seeded values must show carry-forward provenance.
5. The coach must explicitly commit seeded values.
6. Carry-forward must not change the source play.

---

## 15. Seed-on-Open Policy

When opening Pass 2 for a play with no committed personnel:

```text
find source play → create proposal defaults → show carry-forward provenance → wait for coach commit
```

The slot opening itself must not commit personnel.

### 15.1 No Source Found

If no complete prior offensive personnel source exists:

1. leave personnel blank
2. allow manual entry
3. do not invent personnel
4. optionally explain: `No prior complete personnel found.`

---

## 16. Commit & Next Seeding Policy

Commit & Next in Pass 2 should use the same source policy as seed-on-open.

Flow:

```text
1. validate current personnel proposal
2. commit current play explicitly
3. audit current commit where supported
4. advance to next slot
5. evaluate next slot for carry-forward eligibility
6. seed next slot proposal if eligible
7. do not commit next slot
```

Important: Commit & Next commits the current play only. It must not commit the next play.

---

## 17. Manual Edit Interaction

If a coach manually edits a carry-forward seeded value:

1. provenance for that field should become `manualOverride` or `coach`
2. unchanged seeded fields may retain `carryForward`
3. commit should write the final reviewed values
4. source play remains unchanged

---

## 18. Off-Roster Interaction

Carry-forward may carry an off-roster jersey only if that jersey exists in the source committed play. Current validation policy determines whether this blocks current commit.

Rules:

1. off-roster detection should still run on seeded values
2. off-roster resolution must preserve assignment context
3. resolving roster status must not alter source play
4. clearing or correcting a seeded field should affect only the current proposal

---

## 19. Duplicate Interaction

Carry-forward may carry duplicate values if the source committed play contains duplicates. Current validation policy should detect duplicates in the current proposal.

Preferred behavior:

1. do not silently sanitize duplicates
2. show duplicate warning
3. let coach correct current proposal
4. preserve source play unless explicitly edited through its own transaction

---

## 20. Cross-Pass Boundaries

Carry-forward is currently Pass 2 personnel behavior.

It must not:

1. seed Pass 1 formation/play/motion by default
2. seed Pass 1 result/gain-loss by default
3. seed Pass 3 grades by default
4. seed actors by default
5. use display aliases as stored keys

If future carry-forward expands beyond personnel, this spec must be revised first.

---

## 21. Scaffolding vs Prediction vs Carry-Forward

These are distinct mechanisms.

| Mechanism | Example | Source | Writes Committed Data? |
|---|---|---|---|
| Scaffolding | `playNum`, `qtr`, `odk` | session setup | only through defined setup/commit behavior |
| Prediction | next `yardLn`, `dn`, `dist` | prior committed play math | no, proposal default only |
| Carry-forward | Pass 2 personnel | prior committed personnel | no, proposal default only |
| Lookup derivation | `offStrength` from `offForm` | lookup table | no, proposal value only |

Do not collapse these concepts in code or specs. They are cousins, not twins.

---

## 22. UX Requirements

### 22.1 Scaffold UX

Scaffolded fields should be visible and correctable.

The UI should make clear when a row is:

1. empty scaffold
2. segment row
3. committed play row
4. active proposal

### 22.2 Carry-Forward UX

Seeded personnel should clearly show:

1. value
2. carry-forward provenance
3. source play where useful
4. current validation issues
5. commit requirement

Recommended message:

```text
Personnel seeded from Play #[source]. Review before commit.
```

---

## 23. Acceptance Criteria

### SCF-001 — Unique Play Numbers

Session scaffold creates unique `playNum` values.

### SCF-002 — Segment Rows Are Minimal

`ODK = S` rows do not require normal Pass 1 play metadata.

### SCF-003 — Segment Rows Do Not Feed Prediction

Segment rows are skipped as normal prediction/carry-forward source plays.

### SCF-004 — Quarter Edit Does Not Cascade Silently

Changing `qtr` on one committed row does not silently rewrite other committed rows.

### SCF-005 — Series Edit Does Not Cascade Silently

Changing `series` on one committed row does not silently renumber downstream committed rows.

### SCF-006 — Empty Pass 2 Seeds from Prior Complete Personnel

Given prior complete committed offensive personnel, opening empty Pass 2 slot seeds all eleven personnel fields into proposal state.

### SCF-007 — Seed Does Not Commit on Open

Opening a seeded Pass 2 slot does not commit the seeded personnel.

### SCF-008 — Seed Does Not Overwrite Committed Personnel

Opening Pass 2 for a play with committed personnel preserves committed personnel.

### SCF-009 — Commit & Next Uses Same Source Policy

Pass 2 Commit & Next uses the same source policy as seed-on-open.

### SCF-010 — Manual Override Changes Field Provenance

Manually changing a seeded value changes that field’s provenance to coach/manual override.

### SCF-011 — No Source Leaves Blank

If no prior complete offensive personnel source exists, Pass 2 remains blank rather than invented.

### SCF-012 — Source Play Remains Unchanged

Carry-forward never mutates the source play.

---

## 24. Implementation Guardrails for Lovable

### 24.1 Good Inspect Request

```text
Inspect session scaffolding and Pass 2 carry-forward only. Do not modify code.
Report how playNum, qtr, odk, and series are scaffolded.
Report how Pass 2 seed-on-open and Commit & Next choose their source play.
Confirm whether carry-forward values stay proposal-only until commit.
Do not inspect parser or export unless necessary to answer these questions.
```

### 24.2 Good Patch Request

```text
Make the smallest targeted patch to Pass 2 carry-forward.
Empty Pass 2 slots should seed from the most recent prior committed offensive play with complete personnel.
Seed-on-open and Commit & Next must use the same source policy.
Do not overwrite committed personnel.
Do not change Pass 1 parser behavior.
Do not change Hudl export headers.
Add or update focused tests for SCF-006 through SCF-009.
```

### 24.3 Bad Request

```text
Clean up scaffolding and carry-forward.
```

Too broad. That is a hay wagon with no brakes.

---

## 25. Open Issues / Review Items

| ID | Issue | Recommendation |
|---|---|---|
| SCF-001 | Confirm current implementation source policy for Pass 2 seed-on-open | Lovable inspect-only |
| SCF-002 | Confirm current implementation source policy for Pass 2 Commit & Next | Lovable inspect-only |
| SCF-003 | Confirm current scaffold behavior for `series` | Lovable inspect-only |
| SCF-004 | Decide if partial personnel carry-forward should ever exist | Defer; current policy requires complete source |
| SCF-005 | Decide if source play number should show in UI | Defer to UX refinement |
| SCF-006 | Define renumbering policy if play insert/delete becomes active | Future state |

---

## 26. Final Operating Rule

Scaffolding builds the runway. Carry-forward parks the next likely plane nearby.

Neither gets to fly without the coach clearing it for takeoff.
