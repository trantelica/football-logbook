# Hudl Export — Field Reference

**Purpose:** describe every column in the Hudl plays CSV produced by this app — what it means, which side of the ball it pertains to, and what values are legal.
**Audience:** humans and AI assistants reasoning about the export.
**Source of truth:** `HUDL_HEADERS` in `src/engine/hudlExport.ts` (frozen, order must not drift) and `playSchema` in `src/engine/schema.ts`.

---

## 1. How to read this file

The app logs **offensive film for one team**. Almost every column describes that team's own offensive snap. There is no defensive play-logging workflow — defensive and kicking clips exist as rows but carry only identity fields.

Three things to understand before using the data:

1. **One row per clip, not per logged play.** The CSV contains a row for every play slot in the session, because Hudl aligns CSV rows to video clips by play number. A defensive or kicking clip appears as a row with `PLAY #`, `QTR`, `ODK`, `SERIES` filled and everything else blank. **Blank does not mean missing data — it usually means "not applicable to this clip."**
2. **`ODK` is the master switch.** Read it first. If `ODK` is not `O`, the offensive columns are expected to be empty.
3. **Empty string means null.** The writer emits `""` for any null or undefined value.

### Column origin

| Origin | Meaning |
|---|---|
| **Scaffold** | Written when the game is created, before any logging (Pass 0) |
| **Coach** | Entered or dictated by the coach |
| **Lookup** | Derived from a season-governed vocabulary entry |

### Pass

Which stage of the workflow populates the column: **0** = game setup, **1** = situation and play details, **2** = personnel, **3** = blocking grades.

---

## 2. Column reference

### 2.1 Identity and situation — applies to every clip

| # | Column | Side | Origin | Pass | Meaning |
|---|---|---|---|---|---|
| 1 | `PLAY #` | Both | Scaffold | 0 | Sequential clip number, 1..N. **The join key to the video.** Always present. |
| 2 | `QTR` | Both | Scaffold | 0 | Quarter. `1`–`4`, and `5` meaning **overtime**. |
| 3 | `ODK` | Both | Scaffold | 0 | Which unit is on the field. `O` offense, `D` defense, `K` kicking, `S` segment/other. Determines whether the rest of the row applies. |
| 4 | `SERIES` | Offense | Scaffold | 0 | Possession/drive counter. Does not carry across halftime. |

### 2.2 Field position and down — offensive snaps

| # | Column | Side | Origin | Pass | Meaning |
|---|---|---|---|---|---|
| 5 | `YARD LN` | Offense | Coach | 0/1 | Ball spot as a **signed** integer. Negative = own territory, positive = opponent territory (e.g. `-25` is own 25). Field length is a season setting (80 or 100 yards). |
| 6 | `DN` | Offense | Coach | 0/1 | Down. `1`–`4`. |
| 7 | `DIST` | Offense | Coach | 0/1 | Yards to gain for a first down. |
| 8 | `HASH` | Offense | Coach | 0/1 | Ball's hash position. `L` left, `M` middle, `R` right. |
| 14 | `2 MIN` | Both | Coach | 0/1 | Inside the two-minute warning. `Y` / `N`. |

### 2.3 The called play — offense

| # | Column | Side | Origin | Pass | Meaning |
|---|---|---|---|---|---|
| 9 | `OFF FORM` | Offense | Lookup | 1 | Offensive formation, from the season's governed formation vocabulary (team-specific, e.g. `Black`). |
| 10 | `OFF PLAY` | Offense | Lookup | 1 | Play call, from the governed play vocabulary (e.g. `26 Punch`). |
| 11 | `MOTION` | Offense | Lookup | 1 | Pre-snap motion, from the governed motion vocabulary. Blank = no motion. |

> These three are **team-specific vocabularies**, not league-standard enums. Values only mean something relative to that team's playbook. An unknown value triggers a governance prompt rather than being silently accepted.

### 2.4 Outcome — offense

| # | Column | Side | Origin | Pass | Meaning |
|---|---|---|---|---|---|
| 12 | `RESULT` | Offense | Coach | 1 | What happened. Fixed enum — see §3.1. Compound values exist (`Complete, TD`, `Sack, Fumble, Def TD`). |
| 13 | `GN/LS` | Offense | Coach | 1 | Yards gained or lost, signed. `0` is a real value and is not the same as blank. |
| 20 | `EFF` | Offense | Coach | 1 | Coach's judgement of whether the play was **effective**. `Y` / `N`. Subjective, not derived from yardage. |

### 2.5 Actors — offense

Jersey numbers, not names. Should correspond to a player on the season roster.

| # | Column | Side | Origin | Pass | Meaning |
|---|---|---|---|---|---|
| 15 | `RUSHER` | Offense | Coach | 1 | Ball carrier on a run. |
| 16 | `PASSER` | Offense | Coach | 1 | Passer on a pass play. |
| 17 | `RECEIVER` | Offense | Coach | 1 | Targeted receiver. |
| 37 | `RETURNER` | Kicking | Coach | 1 | Return man. Present in the schema for special-teams use; the broader kicking workflow is not active scope. |

### 2.6 Penalty — either side

| # | Column | Side | Origin | Pass | Meaning |
|---|---|---|---|---|---|
| 18 | `PENALTY` | Both | Coach | 1 | Penalty called. **The prefix encodes the side:** `O-` offense, `D-` defense, `S-` special teams. See §3.2. |
| 19 | `PEN YARDS` | Both | Lookup | 1 | Yardage assessed. Auto-filled from a canonical penalty→yards map. |

### 2.7 Derived from lookup — offense

Not typed by the coach. Resolved downstream from the governed parent values (`OFF FORM`, `OFF PLAY`, `MOTION`), which is why they can be blank even on a fully logged play if the parent vocabulary entry lacks the attribute.

| # | Column | Side | Origin | Pass | Meaning |
|---|---|---|---|---|---|
| 21 | `OFF STR` | Offense | Lookup | 1 | Formation strength. `L`, `BAL` (balanced), `R`. |
| 22 | `PERSONNEL` | Offense | Lookup | 1 | Personnel grouping in standard RB/TE notation: `10`, `11`, `12`, `13`, `21`, `22`, `23`, `31`, `32`, `41`, `50`. First digit = running backs, second = tight ends (so `11` is 1 RB, 1 TE). |
| 23 | `PLAY TYPE` | Offense | Lookup | 1 | Category of play. See §3.3. **Note `Run`, not `Rush`** — `Rush` is a valid `RESULT` but not a valid `PLAY TYPE`. |
| 24 | `PLAY DIR` | Offense | Lookup | 1 | Play direction. `L`, `M` (middle), `R`. |
| 25 | `MOTION DIR` | Offense | Lookup | 1 | Motion direction. `L`, `R`. |

### 2.8 Personnel on the field — offense (Pass 2)

Jersey number occupying each of the eleven offensive slots. Blank when personnel was not logged for that clip.

| # | Column | Side | Slot meaning |
|---|---|---|---|
| 26 | `LT` | Offense | Left tackle |
| 27 | `LG` | Offense | Left guard |
| 28 | `C` | Offense | Center |
| 29 | `RG` | Offense | Right guard |
| 30 | `RT` | Offense | Right tackle |
| 31 | `X` | Offense | Split end / wide receiver |
| 32 | `Y` | Offense | Tight end |
| 33 | `1` | Offense | **Signal caller (quarterback)** |
| 34 | `2` | Offense | Back / skill position |
| 35 | `3` | Offense | Back / skill position |
| 36 | `4` | Offense | Back / skill position |

> Slots `1`–`4` are **positional identifiers, not jersey numbers and not an ordering**. `1` is the quarterback. Teams may apply display aliases (e.g. showing `1` as `QB`), but the canonical slot identity is what is exported.
>
> Spatially these read as: `LT LG C RG RT Y` across the line, then `X 3 2 4`, with `1` behind.

### 2.9 Blocking grades — offense (Pass 3)

Coach's grade for each slot's performance on that snap.

| # | Column | Side | Meaning |
|---|---|---|---|
| 38–48 | `LT GRADE`, `LG GRADE`, `C GRADE`, `RG GRADE`, `RT GRADE`, `X GRADE`, `Y GRADE`, `1 GRADE`, `2 GRADE`, `3 GRADE`, `4 GRADE` | Offense | Integer **−3 to +3**. |

> `0` is a legitimate grade meaning neutral. It is **not** the same as blank, which means "not graded." Any consumer must distinguish empty string from zero.
>
> Grade columns pair with the personnel columns of the same name: `LT GRADE` grades whoever is in `LT`.

---

## 3. Value enumerations

### 3.1 `RESULT`

```
1st DN, Batted Down, Block, Blocked, COP,
Complete, Complete/Fumble, Complete/TD,
Def TD, Downed, Dropped, Fair Catch,
Fumble, Fumble/Def TD, Good,
Incomplete, Interception, Interception/Def TD, Interception/Fumble,
No Good, No Good/Def TD, Offsetting Penalties, Out of Bounds,
Penalty, Penalty/Safety, Return,
Rush, Rush/Safety, Rush/TD,
Sack, Sack/Fumble, Sack/Fumble/Def TD, Sack/Safety,
Safety, Scramble, Scramble/TD, TD,
Timeout, Tipped, Touchback
```

*(Compound values use a comma and space in the data — rendered here with `/` to avoid confusion with CSV delimiters. `Def TD` means the defense scored, i.e. a turnover returned for a touchdown against this offense.)*

### 3.2 `PENALTY`

Prefix indicates the offending side.

**Offense (`O-`):** Chop Block, Delay of Game, Face Mask, False Start, Holding, Illegal Block Above Waist, Illegal Block in the Back, Illegal Formation, Illegal Motion, Illegal Shift, Illegal Substitution, Illegal Use of Hands, Ineligible Downfield, Intentional Grounding, Offensive Pass Interference, Personal Foul, Targeting, Too Many Men on Field, Tripping, Unsportsmanlike Conduct

**Defense (`D-`):** Delay of Game, Encroachment, Face Mask, Holding, Illegal Contact, Illegal Substitution, Illegal Use of Hands, Offside, Pass Interference, Personal Foul, Roughing the Kicker, Roughing the Passer, Too Many Men on Field, Unsportsmanlike Conduct

**Special teams (`S-`):** Fair Catch Interference, Illegal Touching, Kick Catch Interference

### 3.3 `PLAY TYPE`

```
2 Pt., 2 Pt. Defend, Extra Pt., Extra Pt. Block,
Fake FG, Fake Punt, FG, FG Block,
KO, KO Rec, Onside Kick, Onside Kick Rec,
Pass, Punt, Punt Rec, Run
```

### 3.4 Short enums

| Column | Values |
|---|---|
| `ODK` | `O`, `D`, `K`, `S` |
| `QTR` | `1`, `2`, `3`, `4`, `5` (=OT) |
| `DN` | `1`, `2`, `3`, `4` |
| `HASH` | `L`, `M`, `R` |
| `EFF`, `2 MIN` | `Y`, `N` |
| `OFF STR` | `L`, `BAL`, `R` |
| `PLAY DIR` | `L`, `M`, `R` |
| `MOTION DIR` | `L`, `R` |
| Grades | `-3`..`3` |

---

## 4. Analysis notes

**Side of the ball, summarised.** Everything except `PLAY #`, `QTR`, `ODK`, `2 MIN`, and `PENALTY` describes **this team's offense**. `PENALTY` can describe either side (read the prefix). `RETURNER` is special teams. There are no defensive-scheme columns — defensive front, coverage, blitz, and gap are deliberately out of scope.

**Filtering to real plays.** To analyse actual offensive snaps, filter `ODK == "O"` **and** require `RESULT` to be non-empty. Rows with `ODK == "O"` but no `RESULT` are scaffolded clips that were never logged.

**Do not assume row count equals play count.** A 40-row file may contain 12 logged plays.

**Blank vs zero.** `GN/LS` and all grade columns treat `0` as meaningful. Never coerce empty string to `0`.

**Vocabulary columns are team-scoped.** `OFF FORM`, `OFF PLAY`, and `MOTION` are only interpretable against that team's playbook, and against the season they were logged in. Do not compare them across teams, and be careful comparing across seasons.

**Companion files.** Each export also produces a notes CSV and a manifest JSON. The notes file is currently **header-only** by design, because coach notes are not yet exposed in the UI.
