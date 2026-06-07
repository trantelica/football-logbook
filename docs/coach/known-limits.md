# Known Limits & Parked Work

> Current as of Release Checkpoint 2026-06-07.
> This document is for coaches and beta users to set expectations on what is — and is not — in the current build.

---

## 1. Session Archive Import

- **Restore-only**: Importing a session archive always creates a **new game** in the current season.
- It does **not** merge into an existing game.
- It does **not** silently replace your active season's lookups, roster, or configuration.

## 2. Coach Notes

- Coach Notes are present in the data model but **hidden from the normal coach-facing UI**.
- They will be exposed once meaningful viewing and editing functionality is wired.

## 3. Defense & Special Teams

- **Defensive play logging** (defensive front, coverage, blitz, gap) is not active scope.
- **Special teams workflow** (kicker, return yards, full kicking support) is not active scope.
- The export header includes `RETURNER` for future use, but the broader kicking workflow is not available.

## 4. UI / Workspace

- PassRail, ActionRail, broader workspace shell, and deeper DraftPanel restructuring remain parked.
- The current layout is functional and stable; broader UI redesigns are future work.

## 5. AI Behavior

- AI is **advisory only**.
- AI does **not** commit.
- AI does **not** overwrite fields already resolved by the deterministic parser.
- AI does **not** bypass validation.
- Pass 3 AI assist is limited to **grading proposal support** — it suggests fills for unresolved grade fields after the parser runs.

## 6. What Is Active

The current build supports:

- Pass 1: Situation and play metadata logging
- Pass 2: Personnel entry with carry-forward seeding
- Pass 3: Blocking grade entry with parser and AI-assisted fallback
- Deterministic candidate → proposal → validate → commit → audit lifecycle
- Hudl CSV export (committed rows only)
- Session archive export and restore-only import

---

## 7. Where to Find the Full Parking Lot

Technical and speculative future items are tracked in:

`docs/specs/parking-lot-future-state.md`

That document is maintained for the development team. Coaches should treat the list above as the authoritative user-facing summary.
