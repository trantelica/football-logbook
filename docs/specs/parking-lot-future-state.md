# Football Engine — Parking Lot / Future State Spec

**Version:** v2.0 draft  
**Status:** Working spec  
**Primary purpose:** capture deferred decisions, future development candidates, and non-current scope without contaminating active specs.  
**Canonical owner:** product owner / coach  
**Implementation owner:** Lovable / code implementation agents  
**Repo path:** `docs/specs/parking-lot-future-state.md`

---

## 1. Conclusion

The parking lot exists to protect the active product.

Future ideas should be captured deliberately, but they must not become accidental current requirements. This document separates:

1. active requirements
2. deferred decisions
3. future workflow candidates
4. speculative enhancements
5. known but non-urgent refinements

The rule is simple:

```text
If it is not active scope, it belongs here until promoted by explicit decision.
```

---

## 2. Operating Rule

Parking-lot items are not implementation authorization.

Nothing in this document should be treated as approved development work until it is promoted into the relevant active spec:

- Canonical Data Contract
- System Architecture
- Multi-Pass Workflow
- Lookup & Reference Governance
- Parser & Narration
- UX Interaction
- Test & Acceptance

This prevents future ideas from sneaking into Lovable prompts as scope fog.

---

## 3. Promotion Criteria

A parking-lot item may be promoted only when it has:

1. clear user value
2. clear workflow owner/pass
3. canonical schema impact understood
4. lookup/reference impact understood
5. UX interaction model sketched
6. acceptance tests identified
7. Lovable patch scope constrained
8. risk classified

If schema or Hudl export may change, the Canonical Data Contract must be updated first.

---

## 4. Status Labels

Use these statuses:

| Status | Meaning |
|---|---|
| `Idea` | captured but not evaluated |
| `Deferred` | valuable but not current scope |
| `Needs Design` | requires product/UX/spec clarification |
| `Needs Code Inspection` | implementation state must be inspected before decision |
| `Ready for Planning` | clear enough for a phase plan, not yet a Lovable patch |
| `Do Not Build Yet` | explicitly held to prevent scope creep |
| `Promoted` | moved into active spec/roadmap |

---

## 5. Current Future-State Items

| ID | Item | Status | Notes / Promotion Gate |
|---|---|---|---|
| FS-001 | Pass 4 defensive metadata on offensive plays | Deferred | Promote only after schema, lookup, UX, and tests are defined |
| FS-002 | Pass 5 kicking / special teams workflow | Deferred | Current export includes `RETURNER`; broader kicking workflow is not active |
| FS-003 | Pass 6+ defensive play logging | Deferred | Must use same proposal/commit architecture if activated |
| FS-004 | Guided session full implementation | Needs Design | North-star exists; exact UI/proposal surface still needs planning |
| FS-005 | AI candidate evidence structure | Needs Design | AI remains advisory; evidence/provenance format needs explicit plan |
| FS-006 | Rich provenance badge visual design | Deferred | Useful polish, not a current architecture blocker |
| FS-007 | Transcript evidence detail view | Deferred | Decide how much transcript evidence should be visible by default |
| FS-008 | Advanced analytics / reports | Idea | Must not distort logging/export schema |
| FS-009 | Bulk roster import / season setup assistant | Deferred | Could improve setup speed; needs import validation design |
| FS-010 | Lookup library import/export | Deferred | Needs versioning and duplicate/merge policy |
| FS-011 | Defensive lookup governance | Deferred | Needed before defensive metadata activation |
| FS-012 | Special teams lookup governance | Deferred | Needed before kicking workflow activation |
| FS-013 | Schema migration/version management UI | Needs Design | Valuable once schema evolution becomes active |
| FS-014 | Historical data migration tools | Do Not Build Yet | Only needed if schema/export changes require migration |
| FS-015 | Coach/team vocabulary profile | Idea | Could help parser/AI, but must not bypass lookup governance |
| FS-016 | Automated regression test suite expansion | Ready for Planning | Start with export, Pass 2 seeding, off-roster, Pass 3 grading cases |
| FS-017 | Code/spec mismatch audit | Ready for Planning | Use Lovable inspect-only prompt; do not refactor broadly |
| FS-018 | Dedicated AI Interface Spec | Deferred | Only needed when AI integration becomes more explicit |
| FS-019 | Product Requirements Document v2 | Deferred | Should be short strategic umbrella after core specs stabilize |
| FS-020 | Release/change log discipline | Deferred | Useful after PR #1 spec library is accepted |

---

## 6. Deferred Schema Candidates

These fields exist in original PDR thinking or future scope but are not active in the current frozen Hudl Plays CSV export.

| Candidate Field | Candidate Label | Status | Rule |
|---|---|---|---|
| `defFront` | `DEF FRONT` | Deferred | Do not add until Pass 4 activation |
| `coverage` | `COVERAGE` | Deferred | Do not add until Pass 4 activation |
| `blitz` | `BLITZ` | Deferred | Do not add until Pass 4 activation |
| `gap` | `GAP` | Deferred | Do not add until Pass 4 activation |
| `kicker` | `KICKER` | Deferred | Do not add until special teams workflow activation |
| `retYards` | `RET YARDS` | Deferred | Do not add until special teams workflow activation |

Schema candidates must not be added to export through implementation convenience. The Canonical Data Contract controls promotion.

---

## 7. Deferred UX Candidates

| ID | UX Candidate | Status | Notes |
|---|---|---|---|
| UX-FS-001 | Guided proposal card final layout | Needs Design | Current specs define behavior, not final design |
| UX-FS-002 | Session orientation prompt | Needs Design | Should summarize current play context and seeded values |
| UX-FS-003 | Correction by code | Idea | Example: coach enters `C7 = 4`; needs careful design |
| UX-FS-004 | Correction by re-speaking | Idea | Useful, but parser ambiguity risk is real |
| UX-FS-005 | Collapsible provenance/evidence detail | Deferred | Keep main UI uncluttered |
| UX-FS-006 | Keyboard-first film review mode | Deferred | Likely valuable for speed |
| UX-FS-007 | Team setup wizard | Deferred | Could gather roster, lookups, field size, aliases |

---

## 8. Deferred Parser / AI Candidates

| ID | Candidate | Status | Rule |
|---|---|---|---|
| PN-FS-001 | Team-specific coach language profile | Idea | Must map through lookup governance |
| PN-FS-002 | AI-assisted unresolved field suggestions | Deferred | Must remain proposal-only |
| PN-FS-003 | AI sanity-check of full proposal | Deferred | Must flag, not silently rewrite |
| PN-FS-004 | Automatic ambiguity question generation | Deferred | Should not create chatty play-by-play friction |
| PN-FS-005 | Learned synonym suggestions | Idea | Suggestions only; coach confirms before canonical use |
| PN-FS-006 | Multi-play narration parsing | Do Not Build Yet | High risk of slot confusion |

---

## 9. Deferred Lookup / Roster Candidates

| ID | Candidate | Status | Rule |
|---|---|---|---|
| LRG-FS-001 | Bulk formation import | Deferred | Needs duplicate/near-duplicate handling |
| LRG-FS-002 | Bulk play import | Deferred | Needs play type/direction validation |
| LRG-FS-003 | Bulk motion import | Deferred | Needs motion direction validation |
| LRG-FS-004 | Roster import from CSV | Deferred | Needs jersey uniqueness validation |
| LRG-FS-005 | Lookup merge workflow | Do Not Build Yet | Risky without history/audit design |
| LRG-FS-006 | Roster inactive player handling | Deferred | Needs historical preservation rules |

---

## 10. Deferred Testing Candidates

| ID | Test Candidate | Status | Notes |
|---|---|---|---|
| TEST-FS-001 | Automated export header test | Ready for Planning | Highest value first automated test |
| TEST-FS-002 | Pass 2 seed-on-open regression test | Ready for Planning | Protects recent behavior |
| TEST-FS-003 | Pass 2 Commit & Next seeding regression test | Ready for Planning | Should match seed-on-open policy |
| TEST-FS-004 | Off-roster assignment preservation test | Ready for Planning | Protects roster resolution flow |
| TEST-FS-005 | Pass 3 `Y1` parser test | Ready for Planning | Protects grade parsing |
| TEST-FS-006 | Pass 3 `go to` normalization test | Ready for Planning | Useful if implemented |
| TEST-FS-007 | Unknown multi-lookup narration test | Deferred | Needed as lookup/parser matures |

---

## 11. Lovable Usage Rules for Parking-Lot Items

Parking-lot items should not be sent to Lovable as broad implementation prompts.

Good:

```text
Inspect only. For FS-017, compare current code to the refreshed docs and report mismatches. Do not modify code.
```

Bad:

```text
Build the future-state roadmap.
```

Good:

```text
Plan only. For TEST-FS-001, identify the smallest test file/change needed to assert the Hudl header contract. Do not implement until approved.
```

Bad:

```text
Add all the tests we need.
```

---

## 12. Review Cadence

Review this parking lot after:

1. major workflow completion
2. major regression fix
3. schema/export change
4. new pass activation
5. before starting any new Lovable phase

The parking lot should shrink by promotion, deletion, or consolidation. It should not become an attic full of haunted furniture.

---

## 13. Final Operating Rule

Capture future ideas here. Build only from promoted specs.

The future can have a shelf. It does not get to drive the bus.
