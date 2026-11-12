# Football Engine — Season, Game Scaffolding & Blocks Spec

**Version:** v2.0 draft  
**Status:** Working spec  
**Primary purpose:** define season setup, game setup, block behavior, and block-to-slot scaffolding without allowing silent mutation of committed play data.  
**Canonical owner:** product owner / coach  
**Implementation owner:** Lovable / code implementation agents  
**Repo path:** `docs/specs/season-game-scaffolding-and-blocks.md`

---

## 1. Conclusion

Season setup, game setup, and block scaffolding are setup systems. They create structure. They do not create hidden football truth.

A block may help scaffold `qtr`, `odk`, `series`, and play slots. A block must not silently create play metadata, personnel, grades, lookup values, or committed football observations.

The governing rule is:

```text
season reference data → game setup → blocks → scaffolded slots → proposal/commit workflow
```

Committed play rows remain governed by:

```text
candidate → proposal → validate → commit → audit → export
```

---

## 2. Scope

This spec governs:

1. season-level setup
2. game-level setup
3. reusable reference data relationship to games
4. block model
5. block types
6. block-to-slot generation
7. quarter behavior
8. ODK behavior
9. series behavior
10. segment rows
11. editing/splitting/deleting blocks
12. scaffold-only row update rules
13. committed-row protection rules
14. acceptance tests

This spec does not govern:

1. Hudl export headers
2. Pass 1 parser grammar
3. Pass 2 personnel carry-forward details
4. Pass 3 grade parsing
5. future defensive/special teams workflows beyond block scaffolding

---

## 3. Non-Negotiables

1. Season setup owns reusable reference data.
2. Game setup owns game-specific logging context.
3. Blocks create or organize scaffolded play slots.
4. Blocks may scaffold `playNum`, `qtr`, `odk`, and `series`.
5. Blocks must not silently fill formation, play, result, gain/loss, actors, personnel, or grades.
6. Block edits may update uncommitted scaffold-only slots where safe.
7. Block edits must not silently mutate committed play rows.
8. Block deletes must not silently delete committed play data.
9. Segment rows must remain distinct from true football plays.
10. Export reads committed rows and scaffolded committed context only through the canonical data contract.

---

## 4. Definitions

| Term | Meaning |
|---|---|
| Season | Container for reusable team context and reference data |
| Game | A single opponent/date logging workspace within a season |
| Session | The active logging workspace for one game or film segment |
| Block | Coach-facing setup unit that creates or organizes play slots |
| Slot | A numbered play/logging position, generally tied to `playNum` |
| Scaffolded row | Row/slot created by setup or block behavior before detailed logging |
| Committed row | Accepted play-row snapshot created through commit workflow |
| Segment row | `ODK = S` row used for film indexing/context, not a true play |

---

## 5. Season-Level Setup

A season is the reusable container for team-level reference data.

Season may own:

1. team name or team label
2. default field size
3. roster
4. personnel slot alias configuration
5. formation lookup library
6. offensive play lookup library
7. motion lookup library
8. penalty fixed reference set, if surfaced in setup
9. coach/team vocabulary helpers
10. season or lookup revision identifier

### 5.1 Season Setup Must Not

Season setup must not:

1. create committed game rows
2. create game-specific play observations
3. infer play results
4. infer personnel participation for a specific game
5. mutate historical game rows when reference data changes

### 5.2 Season Reference Data Rule

Games use the season’s reference data. They do not casually redefine it.

If a game logging flow discovers a new formation, play, motion, or roster player, that change should pass through lookup/reference governance before becoming reusable season data.

---

## 6. Game-Level Setup

A game is the container for one opponent/date logging effort.

Game setup may own:

1. game label
2. opponent
3. date
4. home/away or location, if supported
5. field size, inherited from season or explicitly selected
6. initial quarter structure
7. initial ODK/block structure
8. starting play number
9. number of scaffolded slots
10. game-specific notes
11. game/session committed rows

### 6.1 Game Setup Must Not

Game setup must not:

1. fill `offForm`
2. fill `offPlay`
3. fill `motion`
4. fill `result`
5. fill `gainLoss`
6. fill actors such as `rusher`, `passer`, or `receiver`
7. fill Pass 2 personnel
8. fill Pass 3 grades
9. create lookup values silently
10. mark play slots as football-complete without coach review

---

## 7. Block Model

A block is a coach-facing setup unit that groups play slots and scaffolds basic context.

A block may be stored explicitly in implementation or may exist as a UI/scaffold helper. Either implementation is acceptable if behavior conforms to this spec.

Conceptual block shape:

```ts
type GameBlock = {
  id: string;
  label?: string;
  qtr: 1 | 2 | 3 | 4 | 5;
  odk: "O" | "D" | "K" | "S";
  startPlayNum: number;
  slotCount: number;
  seriesStart?: number;
  notes?: string;
};
```

The exact implementation shape may vary. The behavior rules do not.

---

## 8. Block Types

| ODK | Block Type | Purpose |
|---|---|---|
| O | Offensive block | offensive play logging slots |
| D | Defensive block | defensive sequence placeholder / future defense logging |
| K | Kicking / special teams block | special teams sequence placeholder / future workflow |
| S | Segment block | film index/context row(s), not true plays |

### 8.1 Offensive Blocks

Offensive blocks may scaffold:

1. `playNum`
2. `qtr`
3. `odk = O`
4. `series` where known

Offensive blocks must not scaffold Pass 1 play details, Pass 2 personnel, or Pass 3 grades.

### 8.2 Defensive Blocks

Defensive blocks may scaffold:

1. `playNum`
2. `qtr`
3. `odk = D`

Full defensive logging is future scope unless activated by spec.

### 8.3 Kicking Blocks

Kicking blocks may scaffold:

1. `playNum`
2. `qtr`
3. `odk = K`

Full kicking/special teams logging is future scope unless activated by spec.

### 8.4 Segment Blocks

Segment blocks create `ODK = S` row(s) for film/context indexing.

Segment blocks should not participate in prediction, carry-forward, or standard play validation.

---

## 9. Block-to-Slot Generation

A block may generate one or more slots.

Generated slot fields:

| Field | Rule |
|---|---|
| `playNum` | unique, sequential unless explicit renumbering is designed |
| `qtr` | copied from block |
| `odk` | copied from block |
| `series` | copied or incremented only where safely known |

### 9.1 Slot Numbering

Rules:

1. `playNum` must be unique within the game/session.
2. generated slots should be ordered by `playNum`.
3. inserting slots between existing plays requires explicit renumbering/insertion design.
4. deleting or renumbering committed slots requires explicit review and audit policy.

---

## 10. Quarter Behavior

Blocks belong to a quarter.

Rules:

1. block quarter may scaffold `qtr` into uncommitted scaffold-only slots.
2. editing a block quarter may update uncommitted scaffold-only rows in that block.
3. editing a block quarter must not silently update committed rows.
4. if committed rows exist in the block, show a warning or require explicit row-level correction.
5. second-half boundaries may suspend prediction, but that belongs to prediction logic.

---

## 11. ODK Behavior

Blocks carry an ODK value.

Rules:

1. block ODK may scaffold `odk` into uncommitted scaffold-only slots.
2. editing block ODK may update uncommitted scaffold-only rows in that block.
3. editing block ODK must not silently update committed rows.
4. changing ODK from `O` to another value may make existing play data semantically invalid; this requires explicit review if data exists.
5. `ODK = S` rows are segment rows and should not require normal play metadata.

---

## 12. Series Behavior

Series is primarily relevant for offensive blocks.

Rules:

1. offensive blocks may scaffold `series` where known.
2. series may increment on known offensive possession changes.
3. series should remain conservative until a full possession model exists.
4. editing a block’s series may update uncommitted scaffold-only rows.
5. editing a block’s series must not silently renumber committed rows.
6. if confidence is low, leave series blank or require coach confirmation.

---

## 13. Block Editing

Block edits are allowed only within safety boundaries.

### 13.1 Safe Block Edits

Safe edits may include:

1. label change
2. note change
3. slot count change for uncommitted slots only
4. qtr/ODK/series change for uncommitted scaffold-only rows only

### 13.2 Gated Block Edits

Gated edits require warning or explicit confirmation:

1. changing qtr when committed rows exist
2. changing ODK when committed rows exist
3. changing series when committed rows exist
4. reducing slot count where committed rows would be affected
5. deleting a block with committed rows

### 13.3 Forbidden Silent Edits

The system must not silently:

1. delete committed rows
2. renumber committed rows
3. change committed qtr/ODK/series
4. clear committed Pass 1 data
5. clear committed Pass 2 personnel
6. clear committed Pass 3 grades

---

## 14. Block Splitting

Block splitting may be useful when film structure changes.

Rules:

1. splitting uncommitted scaffold-only slots may be allowed.
2. splitting a block containing committed rows must preserve committed rows.
3. split operation must not renumber committed plays silently.
4. resulting blocks should have clear qtr/ODK/series ownership.
5. if split affects committed context fields, require explicit review.

---

## 15. Block Deletion

Deletion rules:

1. deleting a block with only uncommitted scaffold-only slots may be allowed.
2. deleting a block with committed rows must be blocked or require an explicit destructive workflow.
3. deletion must not orphan committed rows invisibly.
4. deletion must not silently alter Hudl export shape.

---

## 16. Relationship to Prediction

Blocks may provide context used by prediction, but they do not perform prediction.

Prediction remains governed by `prediction-logic.md`.

Important rules:

1. segment rows do not feed prediction as normal plays.
2. non-offensive rows do not feed offensive down/distance/yard-line prediction as normal offensive plays.
3. second-half boundary behavior belongs to prediction gates.

---

## 17. Relationship to Carry-Forward

Blocks do not define carry-forward values.

Pass 2 carry-forward remains governed by `session-scaffolding-and-carry-forward.md`.

Important rules:

1. carry-forward source must be a prior committed offensive play with complete personnel.
2. segment rows are not carry-forward sources.
3. defensive and kicking rows are not offensive personnel carry-forward sources.

---

## 18. UX Requirements

The coach should understand:

1. what season is active
2. what game is active
3. what block is active
4. what quarter the block belongs to
5. what ODK type the block has
6. how many slots the block creates
7. whether rows are scaffold-only or committed
8. whether an edit affects uncommitted scaffold only or committed rows

### 18.1 Setup UX

Season setup should feel separate from game logging.

Game setup should feel separate from play logging.

Block edits should clearly distinguish:

```text
This changes future/uncommitted scaffold only.
```

from:

```text
This would affect committed play rows and requires explicit review.
```

---

## 19. Acceptance Criteria

### SGB-001 — Season Owns Reusable Reference Data

A new game can use season roster, aliases, and lookup libraries without rebuilding them.

### SGB-002 — Game Owns Game-Specific Context

A game stores opponent/date/field/session context separately from season reference data.

### SGB-003 — Block Generates Scaffolded Slots

Creating a block creates slots with unique `playNum`, `qtr`, and `odk` values.

### SGB-004 — Offensive Block Does Not Fill Play Metadata

An offensive block does not fill `offForm`, `offPlay`, `motion`, `result`, `gainLoss`, actors, personnel, or grades.

### SGB-005 — Segment Block Produces Segment Rows

A segment block creates `ODK = S` rows that do not require normal play metadata.

### SGB-006 — Block Edit Updates Uncommitted Scaffold Only

Changing block qtr/ODK/series updates uncommitted scaffold-only slots only.

### SGB-007 — Block Edit Does Not Mutate Committed Rows Silently

Changing block qtr/ODK/series does not silently mutate committed rows.

### SGB-008 — Block Delete Protects Committed Rows

Deleting a block with committed rows is blocked or requires explicit destructive review.

### SGB-009 — Block Split Preserves Committed Rows

Splitting a block preserves committed rows and does not silently renumber plays.

### SGB-010 — Blocks Do Not Feed Carry-Forward Incorrectly

Only prior committed offensive plays with complete personnel can feed Pass 2 carry-forward.

---

## 20. Implementation Guardrails for Lovable

### 20.1 Good Inspect Request

```text
Inspect season/game setup and block scaffolding only. Do not modify code.
Report how seasons, games, blocks, slots, qtr, odk, and series are represented.
Report whether block edits affect uncommitted scaffold-only rows, committed rows, or both.
Compare current behavior against docs/specs/season-game-scaffolding-and-blocks.md.
Do not inspect parser, Pass 2 carry-forward, or Hudl export unless necessary.
```

### 20.2 Good Patch Request

```text
Make the smallest targeted patch to block scaffolding.
Block edits may update uncommitted scaffold-only rows but must not silently mutate committed rows.
Do not change Hudl export headers.
Do not change parser behavior.
Do not change Pass 2 carry-forward behavior.
Add or update focused tests for SGB-006 and SGB-007 if a test surface exists.
```

### 20.3 Bad Request

```text
Improve season and game setup.
```

Too broad. That prompt is a fog cannon.

---

## 21. Open Issues / Review Items

| ID | Issue | Recommendation |
|---|---|---|
| SGB-001 | Confirm whether blocks are stored objects or UI/scaffold helpers | Lovable inspect-only |
| SGB-002 | Confirm season data model and season reference ownership | Lovable inspect-only |
| SGB-003 | Confirm game data model and opponent/date/session context | Lovable inspect-only |
| SGB-004 | Confirm block edit behavior for committed rows | Lovable inspect-only |
| SGB-005 | Confirm block split/delete behavior exists or is future scope | Lovable inspect-only |
| SGB-006 | Define renumbering policy if play insert/delete becomes active | Future state |

---

## 22. Final Operating Rule

Season setup fills the library. Game setup builds the field. Blocks lay out the film. Plays still have to be logged.

No setup system gets to sneak football observations into the record.
