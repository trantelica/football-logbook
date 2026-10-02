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

Shipped:

- **Play rail** for navigating plays, replacing the full-width slots table.
- **Play HUD** — a persistent strip showing play number, situation, and state.
- **Workspace shell** — navigation, work surface, and reference data scroll independently.
- **Play Ledger** and **Reference** drawers, opened on demand from the status bar.
- **Spoken feedback** (off by default) and **light / dark** appearance.
- Session restore — the app reopens the last season and game.

Still parked:

- ActionRail.
- Touch / tablet support below 768px. The eyes-off workflow depends on single-key
  shortcuts, so this needs its own interaction model rather than more layout work.

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
- Hudl CSV export — one row per clip, carrying committed data only
- Session archive export and restore-only import
- Workspace shell, session restore, light/dark, and optional spoken feedback

---

## 7. Where to Find the Full Parking Lot

Technical and speculative future items are tracked in:

`docs/specs/parking-lot-future-state.md`

That document is maintained for the development team. Coaches should treat the list above as the authoritative user-facing summary.
