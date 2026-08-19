# Football Engine — Workspace Architecture

**Version:** v1.0
**Status:** Implemented
**Primary purpose:** describe the workspace shell, spoken feedback, and shared layout constants introduced by the UX pass, and record the decisions a future change should not accidentally undo.
**Canonical owner:** product owner / coach
**Implementation owner:** Lovable / code implementation agents
**Repo path:** `docs/specs/workspace-architecture.md`

---

## 1. Conclusion

The premise of this app is that the coach dictates **with their eyes on the film**. Every UX decision below follows from that. The interface is a heads-up display, not a form: it must report state without costing a glance, and when a glance does happen it must pay off in about a second.

This document exists so the structure survives the next change. Several things here look like defects and are not.

---

## 2. Shell Layout

`src/pages/Index.tsx` composes five regions that scroll independently:

```text
GameBar      season / game identity, workspace settings
PlayHUD      persistent orientation, glanceable
PassRail     play navigation only
DraftPanel   the work surface, owns remaining space
StatusBar    exports, plus on-demand Ledger and Reference drawers
```

Previously every surface was stacked in one scrolling column. On an 80-play game that placed ~160 rows of table below the panel the coach was working in, and changing plays meant scrolling a spreadsheet and scrolling back.

Rules:

1. `PassRail` does navigation only. It is not an inspection surface.
2. `PlayLedger` does inspection only, on demand. It is not navigation.
3. Reference data (lookups, roster) lives in `ReferenceDrawer`, satisfying UX spec §19 — maintenance must be visually separate from logging.
4. The `min-h-0` on the flex row is load-bearing. Without it the scroll regions size to content and the page itself scrolls.

---

## 3. Spoken Feedback

`src/engine/voiceFeedback.ts`, wired through `src/engine/preferencesContext.tsx` and driven by the headless `VoiceAnnouncer`.

The app is voice-*in*; this closes the loop by making it voice-*out*. Two hard rules:

1. **Never speak while the mic is live.** Browser speech recognition will transcribe our own synthesis straight back into the coach's narration. `announce()` refuses when `micLive` is true, and `setMicLive(true)` cancels any in-flight utterance.
2. **Mic arm/stop use a tone, not a word.** Those are exactly the moments speech cannot cover, and also the moments that most need confirmation — narrating a whole play into a mic that never armed loses the play. A short sine burst carries nothing transcribable.

Verbosity is a per-device preference (`off` / `critical` / `full`) and **ships `off`**. Speech is advisory: it never commits, never mutates a proposal, never acknowledges on the coach's behalf.

---

## 4. Canonical Slot Layout

`SLOT_GROUPS` in `src/engine/personnel.ts` is the single source of truth for how the eleven players are arranged, consumed by **both** Pass 2 (personnel) and Pass 3 (grading):

```text
LT LG C RG RT Y     the line, left to right, plus the tight end
X  3  2  4          split end and the backs in field order
1                   the signal caller
```

Before this was shared, Pass 3 grouped spatially while Pass 2 rendered a flat six-column grid, so the same players appeared in two arrangements and LT moved when the coach changed pass.

> **Do not "tidy" the skill row to `1 2 3 4`.** The order is spatial, not numeric. Sorting it would be neater on screen and wrong on the field. A test in `src/test/slotGroups.test.ts` guards this.

Grid classes live in `src/components/slotLayout.ts` as complete literal strings, because Tailwind scans source text — an interpolated `grid-cols-${n}` would not survive the production build.

---

## 5. Design Tokens

`src/index.css` defines semantic tokens; `tailwind.config.ts` registers them. Provenance (UX spec §6) is expressed as token families rather than raw palette values:

| Token | Meaning |
|---|---|
| `predicted` | deterministic prediction from the previous committed play |
| `parsed` | deterministic parser extracted the value |
| `ai` | AI-suggested, advisory only |
| `proposal` / `committed` / `candidate` | transaction state |

> **Do not introduce raw Tailwind palette classes** (`text-amber-400`, `bg-violet-900`) in app components. They were removed precisely because the same semantic meaning had drifted into three different colour sets across DraftPanel, BlockingPanel, and PersonnelPanel. Use the tokens; dark mode then follows automatically instead of being hand-maintained per call site.

Dark mode is applied by `PreferencesProvider` toggling `.dark` on `<html>`. Before this it was fully defined but unreachable — nothing ever set the class.

---

## 6. Session Restore

`src/engine/lastSession.ts` stores a **pointer** (season id + game id) in localStorage so the app reopens the film the coach was working on.

It is workstation state, not game data: never written to IndexedDB, never included in a season or session archive, never audited, and it does not touch `seasonRevision`. It stores ids only and re-validates them on restore — a deleted season, a deleted game, a game that no longer belongs to the stored season, or malformed JSON all degrade to a normal startup.

The game restore is guarded by a ref so it runs **once**. An existing effect clears the active game on every `seasonId` change, including the initial `"" → restored` transition; without the guard a deliberate season switch would drag the previous game back in.

---

## 7. Export Behaviour — Read Before Changing

Two things here look wrong and are correct.

### 7.1 The export emits a row per slot, including unlogged ones

Hudl aligns CSV rows to video clips by play number, so the export must cover **all N clips** in the session. Unlogged slots still carry `playNum` / `qtr` / `odk` / `series` from scaffolding, which is exactly what a defensive or kicking clip needs — those never receive Pass 1–3 data by design but are still real clips in the film.

> **Do not filter the export to logged plays.** It would desynchronize the CSV from the clip list.

### 7.2 Validation is advisory, not a gate

`validateForExport` reports issues; it does not prevent the download. It previously returned early on any issue, so a single out-of-enum value anywhere in a game produced **no files at all** — the coach lost the whole export because of one field.

A realistic way to trigger it: `"Rush"` is a valid `RESULT` but not a valid `PLAY TYPE` (which allows `"Run"`).

> **Do not restore the early return.** The CSV must reflect what is in the database. Issues are surfaced after the files are written so they can be fixed and re-exported.

Imports are the opposite and must stay that way: they refuse on validation failure, because a half-applied import is worse than no import.

### 7.3 The notes CSV is header-only today

`hudl_notes_*.csv` contains only a header because Coach Notes are hidden from the coach-facing UI (`docs/coach/known-limits.md` §2). That is expected, not a failure. It should be revisited when notes are exposed.

---

## 8. Removed Components

| Removed | Replaced by |
|---|---|
| `SlotsGrid` | `PassRail` (navigation) + `PlayLedger` (inspection) |
| `CommittedPlaysPanel` | `PlayLedger` |

`CommittedPlaysPanel` was labelled "Committed Plays (N)" but counted **slots**, so a brand-new 40-play game reported 40 committed with nothing logged. Scaffolding pre-commits `qtr`/`odk`/`series`, so `committedFields.length > 0` is true for every untouched slot and is **not** a valid test for "the coach logged this". Use `isPass1Complete`, which requires a result and gain/loss.

---

## 9. Responsive Behaviour — Read Before Changing

The app targets desktop and laptop film review. It must remain usable in a
laptop window that is not maximized, which in practice means roughly 900–1150px.

**The capture/review split holds to `md` (768px), not `lg`.** See
`Pass1SectionPanel`. The point of the side-by-side layout is that the coach
watches the proposal fill in *while* they speak. Stacked, verification becomes a
scroll and the dictate-and-verify loop breaks. This split was originally at `lg`
(1024px), so a non-maximized laptop window silently lost the adjacency.

> **Do not raise the split back to `lg`,** and do not stack the columns to gain
> horizontal room for a new field. Narrow the fields instead.

**The header must never wrap or overflow.** `GameBar` is a single row whose
children either shrink, drop their label below `lg`, or are explicitly
`shrink-0`. It previously had fixed-width children and no `min-w-0`, so below
~1100px it wrapped to two rows and below ~900px the page scrolled sideways.
Vertical space is what the work surface lives on, and nothing should ever scroll
horizontally.

> **Do not add a fixed-width child to `GameBar`** without giving it `min-w-0` or
> a responsive width. Verify at 886px, which is where it used to break.

Label-dropping is the standard degradation: keep the icon, keep `title=`, hide
the text at a breakpoint. Applied in `GameBar` (below `lg`) and the Pass 1
section-card actions (below `xl`).

### 9.1 Below 768px is out of scope, deliberately

Touch devices are not addressed, and this is a design decision rather than an
omission. The eyes-off workflow depends on single-key shortcuts —
`S`/`D`/`R`/`U`/`F`/`N` — which do not exist without a keyboard. Making the
layout technically fit a phone while quietly breaking that loop would be worse
than an honest minimum width. Tablet support needs its own interaction model,
starting with what replaces the keyboard.

---

## 10. Final Operating Rule

The interface should move fast, but it should never make the coach wonder what just happened — and it should not make them look away from the film to find out.
