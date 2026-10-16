# Pass 4: Defensive Plays

## What the export shows (59 of 112 rows are ODK = D)

Columns already in our contract that defensive rows use the same way:
PLAY #, QTR, ODK, SERIES, DN, DIST, YARD LN, RESULT, GN/LS, PENALTY, PEN YARDS, EFF, PLAY TYPE (Run / Pass / Extra Pt. Block / Punt Rec), OFF FORM / OFF PLAY (opponent's, rarely filled), RETURNER.

New defensive columns (not in our contract today):

| Column | Filled on D rows | Kind | Example values |
|---|---|---|---|
| DEF FRONT | 55 / 59 | Season vocabulary | APE, BOMBS, 3-5, PUNT RETURN |
| COVERAGE | 26 | Season vocabulary | BEST-FRIEND, BURGER-FINGERS, STAY UNO |
| BLITZ | 12 | Season vocabulary | BANANAS, GRUMPY, BIGGITY, CRAZY |
| DEF STR | 4 | Fixed L / R | L, R |
| RET YARDS | 1 | Whole number | 35 |
| TACKLER1–4 | 24 / 12 / 7 / 4 | Roster player | 32, 10, 21 |
| INTERCEPTED BY | 1 | Roster player | 10 |
| COVER PLAYER | 23 | Roster player | 13, 50 |
| PBR (pass breakup) | 3 | Roster player | 4, 55 |
| DAWG (effort award) | 10 | Roster player | 10, 4 |
| UNSUNG (effort award) | 6 | Roster player | 6, 5 |
| TEAM | 59 | Constant (not exported) | RivUC |

Observations that shape the design:
- No defensive personnel (11-man) grid and no defensive grades in the data. "Personnel" on defense here means *who made the play* (tacklers, cover player, awards), not who lined up. That is closer to Pass 1 actors than Pass 2.
- One D row has the full offensive personnel filled (a punt/return clip) — treated as an outlier, not a pattern.
- Hudl exports players as `_Jersey` + `_Name`; our export writes jersey only (same as RUSHER today).
- DN = 0 appears on PAT/kick rows, matching current behaviour.
- Yard line on D rows is signed from the opponent offense's side (their territory negative), so "our"/"their" flip on defense.
- Blitz and coverage are often blank: blank means "none / not called", not missing.

## Pass 4 shape

One pass, visible only on ODK = D slots, three cards reusing Pass 1's section-card engine (dictate per card, hold-Space, read-back strip, Review/Commit, hotkeys N/Y/L):

1. **Situation** — QTR, SERIES, DN, DIST, YARD LN, HASH, 2 MIN (identical to Pass 1, same prediction/carry logic).
2. **Defensive Call** — DEF FRONT, DEF STR, BLITZ, COVERAGE, plus PLAY TYPE (opponent's Run/Pass).
3. **Results** — RESULT, GN/LS, PENALTY, PEN YARDS, EFF, RET YARDS.
4. **Playmakers** — TACKLER 1–4, COVER PLAYER, INTERCEPTED BY, PBR, DAWG, UNSUNG. Roster-backed, using the existing actor picker, roster name matching ("tackle by Fisher and Price" → T1 32, T2 21) and actor integrity checks.

Borrowed as-is: section ownership map, deterministic narration parser + normalization (numbers, yard-line sign, penalties), lookup governance ("add BANANAS to blitz list?"), roster assist, AI fallback (advisory only, only for Pass 4 fields), commit gate, overwrite review, provenance badges, PassRail status chips ("Defense Done").

Defensive-only rules to add:
- Gain/loss is the opponent's gain (positive = bad for us); EFF stays the coach's call.
- Tacklers fill in order (T2 only if T1 set); one player can't be T1 and T2.
- INTERCEPTED BY required when RESULT includes Interception; PBR suggested on Incomplete/Tipped.
- Defensive penalties use the existing D-/O- prefix map.
- Optional carry-forward of DEF FRONT within the same series (suggestion only, like pins).

## Export

Add the new columns to the end of the Hudl header list so existing columns and order stay unchanged; offense rows leave them blank, defense rows leave offense-only columns blank. Every slot still gets a row. Ties into the on-hold export-profile plan later (these would be "standard extended" columns).

## Delivery slices

1. Data model + export columns + season vocabularies for front/blitz/coverage (no UI).
2. Pass 4 shell: pass selector entry, D-slot gating, Situation + Defensive Call cards.
3. Results + Playmakers cards, roster assist for tacklers/awards, validation rules.
4. Dictation: cue words ("front", "blitz", "cover", "tackle by", "dawg", "unsung"), vocabulary hints, AI fallback for Pass 4.
5. PassRail status, ledger columns, docs, tests against this export (re-import the 59 D rows as a check).

## Decisions confirmed
- **Playmakers card stays open.** These fields aren't logged every play but are used often, so the card is shown open and every field is optional.
- **Defensive yard line is from the opponent offense's side.** On ODK = D, "their 25" means the opponent's own 25 and becomes -25; "our 25" becomes +25. This is the reverse of offense. Bare numbers are still left unfilled. Prediction and the AI hint follow the same rule on D slots.
- **TEAM is not exported.** It's left out of the data model.

## Technical details
- `PlayRecord` gains nullable fields: defFront, defStrength, blitz, coverage, retYards, tackler1–4, interceptedBy, coverPlayer, pbr, dawg, unsung. IndexedDB bump v6 → v7 (additive, no data migration); `coercePlayToSchemaTypes` covers new integer fields.
- `schema.ts` field defs with `pass: 4`, enums for defStrength; lookup tables for defFront/blitz/coverage (season-scoped, governed).
- `sectionOwnership.ts`: add `DEF_SECTIONS` (defSituation, defCall, defResults, defPlaymakers); Pass1SectionPanel generalized to take a section set rather than duplicated.
- `isPass4Complete`, SlotMeta `pass4Complete`; workflow visibility gate ODK === "D".
- `HUDL_HEADERS` appended (append-only, tests updated to lock new order); archive import/export carry new fields; old archives import with nulls.
- Yard-line sign: the normalizer and parser take an `odk` context, and "our"/"their" flip when ODK = D. New tests mirror yardLineSigns.test.ts for D.
- Not touched: Pass 1–3 behaviour, offensive parser rules, pins, offensive export columns.
