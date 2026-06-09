# Release Candidate Checklist — Controlled Beta

> Use this checklist before using Hudl Up! -loader on real film with a team.
> Date: 2026-06-09
> Build: APP_VERSION 1.0.0 / SCHEMA_VERSION 2.1.0
> Test baseline: 943 / 943 passing

---

## Core App Readiness

- [ ] Full test suite is green at 943/943 or higher.
- [ ] Welcome screen opens correctly for new users.
- [ ] Existing active game / session is **not** blocked by the welcome screen.
- [ ] Branding displays correctly (title reads "Hudl Up! -loader" with subtitle "AI Video Technician").

---

## End-to-End Workflow

- [ ] Create / load a season (team, year, field size).
- [ ] Create / load a game (opponent, date).
- [ ] Pass 1 — Log a small set of plays (situation, play details, results).
- [ ] Pass 2 — Enter personnel for a play.
- [ ] Pass 3 — Enter blocking grades for a play.
- [ ] Pass 3 parser + AI fallback — One-click "Update Proposal" runs the parser; AI fills unresolved grade fields if needed.
- [ ] Commit remains explicit — every saved play requires pressing **Commit** or **Commit & Next**.

---

## Data Integrity

- [ ] No silent commit — nothing saves without an explicit commit action.
- [ ] No silent overwrite — changing a committed play triggers a confirmation review.
- [ ] Candidate / proposal / transient state does **not** export into CSV or archive.
- [ ] Committed rows persist after a browser refresh.
- [ ] Imported session archive restores as a **new game**; it does **not** merge into or overwrite an existing game.

---

## Export / Restore

- [ ] Hudl CSV export works and contains **committed rows only**.
- [ ] Session archive export works and produces a valid JSON file.
- [ ] Session archive import / restore-only v1 works and creates a new game.
- [ ] A restored imported session can itself export a valid Hudl CSV.

---

## Known Limits (Set Expectations)

- [ ] Archive import v1 is **restore-only** — no merge import exists.
- [ ] No lookup, roster, or season config replacement during archive restore.
- [ ] Coach Notes are present in the data model but **hidden** until real editing functionality exists.
- [ ] Defense and special teams logging are **inactive** in this build.
- [ ] PassRail / ActionRail / broader workspace shell are **parked**.
- [ ] AI is **advisory only** — it proposes, never commits, and never overwrites parser-resolved fields.

---

## Go / No-Go Decision

| Check | Result |
|---|---|
| All core items pass | ☐ Go / ☐ No-Go |
| All workflow items pass | ☐ Go / ☐ No-Go |
| All data integrity items pass | ☐ Go / ☐ No-Go |
| All export / restore items pass | ☐ Go / ☐ No-Go |
| Known limits are acceptable for this beta | ☐ Go / ☐ No-Go |

**Overall decision:** ☐ Go — ready for controlled beta on real film  
**OR**  
☐ No-Go — blockers noted below:

```
Blocker notes:
_________________________________________________________
_________________________________________________________
_________________________________________________________
```
