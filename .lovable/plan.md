# Commit Hotkeys: Next, Stay, Exit (all three passes)

## What exists today
- **N = Commit & Next** and **L = Commit & Leave** already work as single keys in Pass 1. Pass 2 and 3 have N and L too, but the first press only opens the review.
- **Nothing keeps the play open after a commit.** Every commit closes the play, so "Commit & Stay" is the genuinely new action.
- Single letters stop working while your cursor is inside a text box.
- Pass 1, Pass 2 and Pass 3 each wire these keys separately, which is why they behave differently.

## What you will get
One shared set of three actions, identical in every pass.

```text
Action           Letter   Chord (works while typing)
Commit & Next      N      Ctrl/Cmd + Enter
Commit & Stay      K      Ctrl/Cmd + Shift + Enter
Commit & Exit      L      Ctrl/Cmd + Alt + Enter
```

- **One press everywhere:** if you have not reviewed yet, the key does review + commit in a single step, like Pass 1 does now. Validation errors, lookup prompts, overwrite review, TD correction and the PAT dialog still stop it and ask you, exactly as today.
- **Commit & Stay:** saves, then reopens the same play in the same pass showing the saved values, ready for a correction or more dictation.
- **Commit & Exit:** today's "Commit & Leave", renamed to match your wording.
- **Buttons and legend:** every commit button shows its key, and the keyboard legend and Pass 2/3 help line list the three actions and the chords.
- Letters keep today's rules: off while typing, while a dialog is open, and in Pass 1 Text Editing mode. Chords are the only commit keys that work while typing.
- "K" is proposed because S, D, R, U, C, F, N, L are taken in Pass 1 and Space is push-to-talk. Tell me if you prefer another letter.

## Technical details
- `src/engine/passShortcuts.ts`: add `useCommitShortcuts({ enabled, suspended, onNext, onStay, onExit })` with the letter bindings plus a chord listener that skips the text-input guard but keeps the open-dialog and suspended guards. Add a single `COMMIT_ACTIONS` constant (label, letter, chord) used by buttons and the legend so they cannot drift.
- `src/engine/transaction.tsx`: add `commitAndStay()` next to `commitAndNext()`. After a successful commit it calls the existing `selectSlot(sameNum)`, which already reloads saved values. Widen `pendingAdvanceAfterCommitRef` to `{ fromSlotNum, activePass, mode: "next" | "stay" }` so deferred commits (overwrite review, TD correction) resume with the right follow-up. Cancel paths clear it as they do now.
- `src/components/Pass1SectionPanel.tsx`, `DraftPanel.tsx`: replace the separate N/L bindings with the shared hook. Pass 2 and 3 reuse Pass 1's pattern: if not in proposal, run `reviewProposal`, then commit only when no error or dialog was raised. Add a Stay button beside Next and Exit in both button rows.
- `KeyboardLegend.tsx`: Commit group lists the three actions from `COMMIT_ACTIONS`.
- Tests: new `commitShortcuts.test.ts` (letters blocked in inputs, chords allowed in inputs, both blocked with a dialog open, no collision with push-to-talk) and a transaction test for stay (slot remains selected, saved values shown, deferred overwrite resumes in stay mode).
- Not touched: parser, AI, carry-forward and pins, schema, export, PassRail, Index.tsx, commit validation rules.
- Risk to verify first: chord collisions with browser or OS shortcuts. Ctrl/Cmd+Enter and Ctrl/Cmd+Shift+Enter are normally free; Ctrl/Cmd+Alt+Enter will be checked in the preview.

---

# On hold: Configurable Export Profiles and Custom Fields

Saved for later. Nothing here will be built until you say go.

## Goal

Let other coaches match their own Hudl setup without code changes. The Hudl columns stay protected, and fields unique to a program (like yours) become custom fields that coaches manage.

## 1. Classify today's contract

First step: audit every column in today's export and put each one into one of three tiers. The audit is shown to you for sign-off before any build.

- **Canonical (Hudl-native, locked):** standard Hudl columns such as PLAY #, ODK, DN, DIST, YARD LN, HASH, OFF FORM, OFF PLAY, GN/LS and RESULT. The header and meaning can't be changed. A coach can only choose to include or hide the column, and required ones can't be hidden.
- **Standard extended (shipped by the app, not in Hudl):** fields the app supports for everyone, such as positions 1-4, X and Y, and the grades. The header label can be changed (for example, H for position 2), but not the meaning.
- **Custom (yours):** columns that exist only for your program. They move out of the built-in contract and into your season's custom field set, so they're preserved for you but not forced on other coaches.

## 2. Custom fields

A coach defines a custom field once per season, with these settings:

- **Name / header**
- **Type:** whole number, text, or a choice from a list
- **Pass it belongs to:** Pass 1, 2 or 3
- **Optional input cue words** for dictation

Values are stored in a separate "custom values" area on each play, so they never touch the core fields.

## 3. Data protection rules

- Once any committed play has a value in a field, that field is **locked in shape**: its type, internal key and pass can't change.
- After locking, only these changes are allowed:
  - renaming the header (stored data is unaffected)
  - hiding the field from the export
  - **retiring** the field: it's hidden everywhere, and the data is kept and included in archives
- Deleting a field with data is not allowed. Deleting is only possible while the field is empty.
- Every change to a field definition is a recorded, versioned change in the season audit trail, like lookup and roster changes today.
- Changing the type of a field that has data is not supported. The coach would create a new field and retire the old one.
- Each export and archive records the profile version and a fingerprint of it, so any past file can be explained and rebuilt.

## 4. Screens

- **Season settings > Fields & Export:**
  - one list showing every column with its tier badge (Hudl / Standard / Custom)
  - drag to reorder the export
  - include or hide toggle
  - rename, where the tier allows it
  - "Add custom field"
  - lock icons on fields that have data, with "why" tooltips
- **Pass panels:** custom fields appear in a "Custom" group at the bottom of their pass's draft entry. They follow the same Candidate > Proposal > Commit flow, with the same overwrite prompts and provenance badges. No new layout patterns are added.
- **Play Ledger:** custom columns appear after the standard columns, and coaches can choose which ones to show.
- **Preflight check:** warns about custom fields that are empty on committed plays. This is advisory only, like today.
- **Default:** a new season starts with the canonical and standard fields only, so the screens look exactly like today until a coach adds something.

## 4b. Carry-forward custom fields

A coach can mark a custom field as **carry-forward** and pick a scope:

- **Same series + same ODK** (default): stops when possession changes or the series ends
- **Same ODK for this game**
- **Next play only**

How it behaves:

- A carried value is a **suggestion**, not a commit. It appears on the next slot's proposal with a "Carried" badge, the same way personnel carry-forward and pins work today.
- It only fills empty fields. It never overwrites a value the coach typed, dictated or committed.
- Editing the value on a play starts a new carry from that play. Clearing it stops the carry.
- Carrying stops at a scope boundary, such as a new series, an ODK change, a quarter or half, or a new game. A quiet note says why it stopped.

Challenges and how the plan handles them:

- **Series detection:** the app's possession and series logic already exists and is reused. Gaps in the data, like skipped slots, stop the carry instead of guessing.
- **Editing old plays:** changing an earlier committed value never rewrites later committed plays. Later uncommitted slots show the new suggestion. Committed plays that differ are listed in a review prompt, and the coach can update them one at a time or all at once. Nothing changes silently.
- **Order of operations:** pins and the existing personnel carry-forward run first, then custom carry-forward. The rules are deterministic and covered by tests.
- **Export:** the export shows only committed values. A carried suggestion that was never committed exports blank, and the preflight check warns about it.
- **Changing the rule later:** changing a field's carry scope after it has data affects new suggestions only. Committed data is never touched.

## 5. Dictation

- Phase 1 (this build): custom fields are typed in by hand. If the coach sets cue words, the deterministic parser fills the field with the value after a cue word. For example, cue "tempo" + "tempo fast" gives "fast". Choice fields only accept values from the field's list, and an unknown value goes through the existing "add to list?" check.
- Custom field names and choice values are added to the dictation vocabulary hints.
- The AI fallback stays as it is: it never fills custom fields in this build. It could be added later as an opt-in.
- Built-in parsing for canonical and standard fields does not change.

## 6. Delivery slices

1. **Audit:** classify today's columns. You approve the tier list.
2. **Export profile:** move the built-in contract into a default profile (the output stays byte-identical), and add the include/hide/rename/reorder editor.
3. **Custom fields:** definitions, storage, protection rules, and audit entries.
4. **Screens:** custom group in the pass panels and custom columns in the Play Ledger.
5. **Dictation:** cue-word parsing for custom fields and vocabulary hints.
6. **Carry-forward custom fields:** scope options, seeding, stop-reasons, and the review prompt for earlier edits.

## Technical details

- `FieldDef { key, tier: "canonical"|"standard"|"custom", type, pass, header, cues?, options?, status: "active"|"retired", version }` is stored per season in IndexedDB. This needs a schema bump (v7) with a migration that adds no data. Custom field keys are `custom.<uuid>` and never get reused.
- `PlayRow.custom?: Record<string, number|string|null>`. Values are converted to the correct type when committed, using the existing type-coercion step.
- The export engine stays pure: `buildHudlCsv(plays, profile)`. `DEFAULT_PROFILE` is built from today's `HUDL_HEADERS`. The current export tests become default-profile tests. Existing rules stay: a row for every slot and no early return.
- The lock check is "any committed play has a non-null value for this key". The editor enforces it, and the import and transfer steps check it again.
- Season packages and session archives include the field definitions. When an archive is restored, custom fields are matched by key. If a key is unknown, its data is still restored and the field is marked retired.

## Out of scope

- Formula or computed columns
- Export targets other than Hudl
- Sharing profiles between coaches through the cloud
- AI filling of custom fields
