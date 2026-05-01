# Football Engine — UX Interaction Spec

**Version:** v2.0 draft  
**Status:** Working spec  
**Primary purpose:** define interaction rules that preserve trust, speed, and deterministic data integrity.  
**Canonical owner:** product owner / coach  
**Implementation owner:** Lovable / code implementation agents  
**Repo path:** `docs/specs/ux-interaction.md`

---

## 1. Conclusion

The Football Engine UI should feel like a disciplined coaching instrument: fast, clear, stable, and reviewable.

The UX must reinforce the architecture:

```text
candidate → proposal → validate → commit → audit
```

The coach may speak naturally and move quickly, but the interface must never blur the line between draft/proposal data and committed data.

---

## 2. UX Non-Negotiables

1. The active play number must always be clear.
2. The active pass must always be clear.
3. Proposal state must be visually distinct from committed state.
4. Predicted values must be visible before commit.
5. Carry-forward values must be visible before commit.
6. Lookup-derived values must be visible before commit.
7. AI/parser-derived values must be distinguishable where useful.
8. No workflow may silently commit.
9. No workflow may silently overwrite committed data.
10. Commit controls must be explicit and predictable.
11. Pass changes must narrow focus, not hide data risk.
12. Errors must be specific, field-level, and actionable.

---

## 3. Core Interaction Model

The coach should always understand:

1. where am I?
2. what pass am I in?
3. what is already committed?
4. what is currently proposed?
5. what will happen if I click commit?
6. what needs correction?
7. what values came from me, the system, lookup, prediction, carry-forward, parser, or AI?

Ambiguity in system state is unacceptable.

---

## 4. Visual State Model

The UI should distinguish these states:

| State | Meaning | UX Requirement |
|---|---|---|
| Empty slot | no committed row for field group | allow proposal creation |
| Seeded proposal | proposal contains defaults | show default/provenance indicators |
| Active proposal | editable draft exists | show review/commit controls |
| Validation blocked | proposal has blocking issues | show field-specific corrections |
| Overwrite review | proposal changes committed non-null values | show before/after comparison |
| Committed | accepted snapshot | stable, final visual treatment |
| Maintenance mode | editing reference/config data | visually separated from logging |

---

## 5. Proposal vs Commit Distinction

Proposal fields may be edited. Committed fields are accepted snapshots.

Rules:

1. Proposal fields should have a visible draft treatment.
2. Committed fields should appear stable and final.
3. Touched fields should be visually identifiable.
4. Fields with provenance should show concise tags or badges.
5. Overwrite review should show before and after values.
6. The UI must not let draft styling and committed styling collapse into one indistinct surface.

---

## 6. Provenance Badges

Recommended proposal provenance badges:

| Badge | Meaning |
|---|---|
| Coach | directly entered or manually edited by coach |
| Parser | deterministic parser extracted value |
| AI | AI-assisted suggested value |
| Lookup | derived from governed lookup |
| Predicted | deterministic prediction default |
| Carry-forward | copied from prior committed context |
| Override | coach changed a proposed/default value |
| System | scaffolded by setup logic |

Badges should help, not clutter. If space is limited, use concise visual tokens with accessible labels.

---

## 7. Active Pass UX

The active pass should shape the workspace.

| Pass | UX Focus |
|---:|---|
| 0 | game/session scaffold |
| 1 | core play metadata |
| 2 | personnel assignment |
| 3 | blocking/grading |

Rules:

1. pass switcher should be obvious
2. active pass should be visibly highlighted
3. editable fields should narrow to the active pass
4. stable context should remain visible
5. unrelated committed fields should not look editable by default
6. cross-pass edits, if allowed, must be explicit and gated

---

## 8. Stable Context Header

Each pass should show a stable context header.

Recommended context:

- play number
- quarter
- ODK
- down
- distance
- yard line
- formation
- play
- result where useful

The context header is primarily orientation. It should not become an accidental edit surface.

---

## 9. Pass 1 UX

Pass 1 should support efficient basic play logging.

Primary UX needs:

1. natural narration or field entry
2. governed lookup handling
3. proposal review
4. commit and next
5. prediction defaults for next play
6. visible actor extraction
7. clear correction path

Pass 1 should feel fluid, but never slippery.

### 9.1 Pass 1 Proposal Review

A Pass 1 proposal should show:

1. down / distance / yard line / hash
2. formation / play / motion
3. result / gain-loss
4. actors: rusher, passer, receiver
5. lookup-derived values: strength, personnel, type, direction
6. prediction/provenance badges
7. unresolved fields or blocking issues

---

## 10. Pass 2 UX

Pass 2 is a personnel assignment workspace.

It should present the eleven canonical slots:

```text
LT, LG, C, RG, RT, Y, X, 1, 2, 3, 4
```

Rules:

1. display aliases may appear, but canonical slot identity must remain clear
2. seeded values should be visibly carry-forward defaults
3. committed values must not be overwritten by seed-on-open
4. duplicate jersey warnings should be field-specific
5. off-roster warnings should preserve assignment context
6. roster add/correct/clear actions should return to the personnel proposal
7. Pass 2 should not look like a general Pass 1 parser workspace

### 10.1 Empty Slot Seeding UX

When an empty Pass 2 slot seeds from prior personnel, the UI should communicate:

```text
Seeded from prior committed offensive personnel. Review before commit.
```

Seeded values are not committed until the coach commits.

---

## 11. Pass 3 UX

Pass 3 is a blocking/grading workspace.

Rules:

1. Pass 3 panel appears only for Pass 3.
2. Manual grade edits and narrated grade edits use the same proposal path.
3. Grade values must be constrained to -3..3.
4. Visual grade indicators should be clear but not noisy.
5. Provenance tags should show narrated/manual/default origin where useful.
6. Pass 3 should not invite broad play metadata editing.

### 11.1 Grade Display

Recommended grade display:

- slot label
- assigned player jersey/name where available
- current committed grade if any
- proposed grade if active proposal exists
- provenance indicator
- validation state

---

## 12. Guided Session UX

North-star interaction:

```text
Coach speaks naturally.
System assembles proposal silently.
Coach reviews proposal explicitly.
System never commits silently.
```

Guided session should feel like:

1. orientation
2. narration
3. proposal
4. accept/correct/pause/restart
5. advance with carry-forward context

The coach should not need to understand parser stages or internal transaction mechanics.

### 12.1 Guided Proposal Presentation

A guided proposal should be coach-readable.

Example shape:

```text
Play #4 proposal
1. Down: 1st
2. Distance: 10
3. Ball: -20
4. Hash: M
5. Formation: Black
6. Motion: 3 Across
7. Play: 26 Punch
8. Rusher: 4
9. Gain/Loss: +4
10. Result: Rush

Actions: Accept & Next | Accept & Pause | Correct | Discard
```

The exact UI may vary, but the proposal must remain the review surface.

---

## 13. Lookup Interrupt UX

Unknown governed values should trigger a narrow governance interrupt.

The interrupt should allow:

1. add as new canonical value
2. map/correct to existing value
3. leave blank / reject
4. exit or pause

Rules:

1. the current play context must remain intact
2. unresolved candidate values must not be lost
3. resolving one lookup must not discard other unknowns
4. append requires dependent fields
5. after resolution, return to proposal review
6. no play commit occurs until explicit coach action

### 13.1 Avoiding Modal Loops

If multiple unknowns exist, the UI should queue or sequence them without trapping the coach.

The coach must always have an escape path.

---

## 14. Roster / Off-Roster UX

Off-roster detection should explain the issue and preserve context.

Example:

```text
#84 is assigned to Y but is not on the roster.
Add player, correct jersey, or clear assignment.
```

Rules:

1. show the affected jersey
2. show the affected slot/field
3. preserve assignment intent after roster add
4. return to the proposal after resolution
5. do not clear unrelated personnel fields

---

## 15. Dropdown and Suggestion UX

Lookup suggestion dropdowns should be predictable.

Rules:

1. dropdowns should dismiss globally when clicking outside
2. dropdowns should not trap keyboard focus
3. selecting a suggestion should update proposal state, not commit directly
4. suggestions should not auto-select fuzzy matches
5. governed unknowns should use governance flow, not raw dropdown insertion

This rule applies across passes where dropdowns exist.

---

## 16. Overwrite Review UX

When changing committed data, show a before/after comparison.

Recommended shape:

| Field | Current Committed | Proposed |
|---|---|---|
| OFF PLAY | 26 Punch | 38 Punch |

Rules:

1. only touched fields should appear
2. destructive changes should require explicit confirmation
3. untouched committed fields should be preserved
4. warnings should be calm and specific
5. no one-click destructive surprise

---

## 17. Commit & Next UX

Commit & Next should:

1. validate current proposal
2. commit only after explicit click/action
3. confirm briefly
4. advance to next slot
5. seed proposal defaults for the next slot where rules allow
6. place focus predictably
7. avoid scroll jumps
8. avoid clearing useful context

Commit & Next must not silently commit the next slot.

---

## 18. Error Message Philosophy

Error messages should be:

1. specific
2. field-level
3. actionable
4. non-alarmist
5. short enough to read during film review

Avoid:

1. generic “invalid input” messages
2. long warnings for common corrections
3. blaming tone
4. modal interruptions for minor issues
5. hiding the field that caused the issue

Good:

```text
Grade must be between -3 and 3.
```

Bad:

```text
An error occurred.
```

---

## 19. Configuration / Maintenance UX

Configuration and maintenance modes must be visually distinct from logging mode.

Rules:

1. logging inputs should be disabled or clearly separated during configuration
2. lookup maintenance should not look like play commit
3. roster maintenance should not silently update committed plays
4. mode changes should be obvious
5. returning to logging should restore play context where appropriate

---

## 20. Accessibility and Efficiency

The UI should support fast film review.

Recommended behaviors:

1. keyboard-friendly navigation
2. predictable focus movement
3. concise labels
4. readable contrast
5. minimal unexpected scroll shifts
6. clear disabled states
7. visible active slot
8. responsive controls during repeated entry

Speed matters. Trust matters more.

---

## 21. Implementation Guardrails for Lovable

### 21.1 Good Inspect Request

```text
Inspect the current UX behavior only. Do not modify code.
Report whether proposal state, committed state, provenance badges, lookup interrupts, and pass-specific panels are visually distinct.
Flag any place where a button label implies commit but only navigates, or implies navigate but commits.
```

### 21.2 Good Patch Request

```text
Make the smallest targeted UX patch.
Fix Commit & Next so the label and behavior match: it commits the current proposal, then opens/seeds the next slot.
Do not change export headers.
Do not change parser behavior.
Do not alter canonical field keys.
Preserve proposal review before commit.
```

### 21.3 Bad Request

```text
Make the app UX better and more intuitive.
```

Too broad. It risks polishing the doorknob while moving the load-bearing wall.

---

## 22. Acceptance Criteria

### 22.1 Universal UX Acceptance

The UI passes if:

1. active play number is visible
2. active pass is visible
3. proposal and committed states are visually distinct
4. validation issues identify fields
5. commit controls are explicit
6. overwrite review shows before/after values
7. seeded/predicted/carry-forward values are visible before commit
8. no UI action silently mutates committed data

### 22.2 Pass 1 UX Acceptance

Pass 1 UX passes if:

1. basic play proposal is easy to scan
2. lookup issues are surfaced before commit
3. actor fields are visible when proposed
4. Commit & Next commits current slot only
5. prediction defaults for next play are visible before commit

### 22.3 Pass 2 UX Acceptance

Pass 2 UX passes if:

1. eleven canonical slots are visible
2. aliases do not obscure canonical slot mapping
3. carry-forward seeded values are visually identified
4. duplicate/off-roster issues are field-specific
5. roster resolution preserves assignment context
6. committed personnel are not overwritten by opening the slot

### 22.4 Pass 3 UX Acceptance

Pass 3 UX passes if:

1. grading panel appears only in Pass 3
2. grade values are constrained and readable
3. narrated/manual grade proposals use same review path
4. visual grade indicators are useful but not noisy
5. Pass 3 does not invite broad play metadata edits

---

## 23. Open Issues / Review Items

| ID | Issue | Recommendation |
|---|---|---|
| UX-001 | Decide exact proposal card layout for guided session | Defer until guided-session implementation plan |
| UX-002 | Decide how much transcript evidence to show by default | Keep concise; detail view if needed |
| UX-003 | Confirm global dropdown dismissal across all passes | Keep as focused regression item |
| UX-004 | Confirm Commit & Next label/behavior alignment | Keep as regression item |
| UX-005 | Confirm off-roster resolution visual flow preserves context | Keep as Pass 2 regression item |
| UX-006 | Define final provenance badge visual design | Defer until UI polish pass |

---

## 24. Final Operating Rule

The interface should move fast, but it should never make the coach wonder what just happened.

Every committed value should feel earned, visible, and reviewable.
