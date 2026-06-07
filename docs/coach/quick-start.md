# Hudl Up! -loader — Coach Quick Start

> Current as of Release Checkpoint 2026-06-07.

---

## 1. Before You Start

Create a **Season** first (team, year, field size). Then add a **Game** (opponent and date). Everything you log is tied to that season and game.

---

## 2. Start or Load a Game

- **New game**: Pick the season, enter opponent and date, then select the game to open it.
- **Restore an old session**: Use **Load Session** in the status bar to import a previously exported session archive. The restored session becomes a **new game** in the current season — it does not overwrite anything already there.

---

## 3. Logging a Play (Three Passes)

Each play is logged in three passes. The app creates empty slots ahead of time so you can jump around, but the normal flow is sequential.

### Pass 1 — Situation & Play Details

Fill in the situation fields and play metadata:

- Quarter, down, distance, yard line, hash
- Offensive formation, play, motion
- Result, gain/loss, penalty if any

Tip: You can speak the play into the transcript panel and press **Update Proposal** to let the parser fill fields from your narration.

### Pass 2 — Personnel

Enter the 11 players on the field.

- Type or speak assignments like "LT 77, LG 55, C 60".
- The app will carry personnel forward from the previous play automatically when you open a new slot, so you only change what is different.
- If a jersey is not on the roster, you will get a chance to resolve it before committing.

### Pass 3 — Blocking Grades

Enter grades for the offensive line and skill positions.

- Speak grades naturally: "O-line gets a one except right tackle gets a two."
- Press **Update Proposal** to run the parser. If anything remains unresolved, the app can suggest AI-assisted fills.
- Review every proposal before committing. The parser and AI are advisory — you decide what gets committed.

---

## 4. Update Proposal → Review → Commit

1. **Update Proposal** assembles your input into a reviewable proposal.
2. Review the proposal card. Fields with warnings or conflicts are highlighted.
3. Press **Commit** to save the play to the session. Commit is always explicit — nothing is saved without your confirmation.
4. Use **Commit & Next** to commit and move to the next slot automatically.

If you need to change a committed play, use the overwrite review path. The app will ask you to confirm before changing anything already committed.

---

## 5. Export

### Hudl CSV

- Exports **committed plays only**.
- Empty or uncommitted slots do not appear.
- Download and upload the CSV directly to Hudl.

### Session Archive

- Exports the full session (plays + a snapshot of lookups and roster) as a JSON archive.
- Use **Load Session** later to restore it as a new game.

---

## 6. Key Rules to Remember

- **No silent commits**: You must press Commit.
- **No silent overwrites**: Changing a committed play triggers a confirmation.
- **Parser and AI are advisory**: They propose; you approve.
- **Exports are committed-only**: What you see in the export is what has been committed.

---

## 7. Getting Help

If a field is not behaving the way you expect, check the proposal card for warnings. The app explains most conflicts inline. If a value is tagged as parser- or AI-proposed, verify it before committing.
