# Cross-Pass Consistency: Shortcuts, Action Placement, Quiet Details

Three narrow slices from the earlier review, in order. Each ends green on the full suite and can be accepted independently.

## Slice A — Keyboard parity for Pass 2 and Pass 3

Today only Pass 1 responds to single-key shortcuts. Pass 2 and Pass 3 are mouse-only, so the coach's hands and eyes leave the film.

Same keys, same meanings, everywhere they apply:
- `D` start / stop dictation for the pass's narration box
- `U` update proposal (parse what was said)
- `C` clear the narration box
- `N` commit and open the next play
- `L` commit and stay
- `Esc` leave a text box and hand the keys back

Rules kept identical to Pass 1: keys are ignored while typing in a field, while any dialog is open, and while Text Editing is on. A key that does not apply to the current pass does nothing. The shortcut card gets a short note showing which keys work in which pass.

## Slice B — Stop burying Commit

In Pass 2 and Pass 3 the Review / Commit / Commit & Next row sits at the very bottom, under the eleven player fields and the Actor Integrity block, so committing means scrolling every play.

- The action row becomes pinned to the bottom edge of the work surface in Pass 2 and Pass 3, always visible and reachable without scrolling. Same buttons, same order, same enable rules.
- Actor Integrity collapses to one quiet line when everything checks out ("Actors check out"), expandable on click. The moment something is wrong it opens itself and shows the fix cards exactly as today.
- Pass 1 action placement is not touched; its panel already owns its own controls.

## Slice C — Speed work, measured first

Two known repeated scans (lookup-removal safety check reading every play in the season; audit sequence reading every audit record) plus a broad re-render surface. Nothing here is a confirmed slowdown yet, so the slice starts by timing them on a real game and only changes what the numbers justify. Proposed separately once measured; not part of A or B.

## Technical notes

- New `src/engine/passShortcuts.ts` (or a `usePassShortcuts` hook) extracts the existing Pass 1 guard logic verbatim — `anyBlockingModalOpen()` Radix open-state probe, `isTextInputTarget`, modifier bail-out — so all three passes share one implementation. Pass 1 is refactored to consume it with no behavior change.
- `PersonnelPanel.tsx` / `BlockingPanel.tsx` register their own handlers (dictate, apply narration, clear) plus the transaction-level `reviewProposal` / `commitProposal` / `commitAndNext`.
- Pass 2/3 action row: `DraftPanel.tsx` renders the existing outer row inside a `sticky bottom-0` container with panel background and top border for passes 2 and 3 only. No change to button set, ordering, or disabled predicates. Pass 1's `pass1SectionOwnsActions` suppression stays.
- Actor Integrity collapse uses a local `useState` in `PersonnelPanel.tsx`, forced open when `actorErrors.length > 0`. No validation, commit-gate, or provenance change.
- Guardrails: no parser, transaction semantics, pass ownership, carry-forward, pin, schema, export, or AI changes. No PassRail or Index shell restructuring. No raw Tailwind palette classes. New tests cover shortcut guards (ignored while typing / dialog open) and the Actor Integrity forced-open case; baseline 1014 tests must stay green.
