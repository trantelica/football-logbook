

# Implementation: Proposal-Gated Commit, Type Normalization, No-Op Overwrite Blocking

## Overview
Three changes plus a visual color system update: (1) require Proposal review before Commit, (2) schema-driven type normalization with strict integer parsing, (3) block no-op overwrites, and (4) update color tokens from amber "draft" to neutral "candidate" + amber "proposal" + green "committed."

---

## 1. Color System Update (Candidate = Neutral/Blue-Gray, Proposal = Amber)

### `src/index.css`
Replace the `--draft` / `--draft-foreground` / `--draft-muted` / `--field-touched` tokens in both light and dark themes:

**Light mode:**
- `--candidate: 215 14% 90%` (neutral blue-gray)
- `--candidate-foreground: 220 20% 10%`
- `--candidate-muted: 215 14% 96%`
- `--proposal: 38 92% 50%` (amber — the old draft color)
- `--proposal-foreground: 38 92% 14%`
- `--proposal-muted: 38 60% 92%`
- `--field-touched: 215 40% 92%` (neutral blue tint instead of amber)

**Dark mode:**
- `--candidate: 220 16% 20%`
- `--candidate-foreground: 210 20% 85%`
- `--candidate-muted: 220 16% 12%`
- `--proposal: 38 80% 50%`
- `--proposal-foreground: 38 92% 95%`
- `--proposal-muted: 38 40% 16%`
- `--field-touched: 215 30% 18%`

Committed tokens remain unchanged.

### `tailwind.config.ts`
Replace `draft` color mapping with `candidate` and `proposal`:
```
candidate: { DEFAULT, foreground, muted }
proposal: { DEFAULT, foreground, muted }
```

---

## 2. Schema-Driven Normalization in `src/engine/validation.ts`

### Add `normalizeToSchema()` function
Replace the manual field-by-field normalization block (lines 189-205) with a schema-driven loop:

```typescript
function normalizeToSchema(candidate: CandidateData, playNum: number): PlayRecord {
  const record: Record<string, unknown> = { gameId: candidate.gameId, playNum };
  for (const fieldDef of playSchema) {
    if (fieldDef.name === "playNum") continue;
    const raw = (candidate as Record<string, unknown>)[fieldDef.name];
    if (raw === null || raw === undefined || raw === "") {
      record[fieldDef.name] = null;
      continue;
    }
    switch (fieldDef.dataType) {
      case "integer": {
        const str = String(raw).trim();
        if (!/^-?\d+$/.test(str)) { record[fieldDef.name] = null; break; }
        record[fieldDef.name] = Number(str);
        break;
      }
      case "enum":
        record[fieldDef.name] = String(raw);
        break;
      case "boolean":
        record[fieldDef.name] = raw === true || raw === "true";
        break;
      case "string":
        record[fieldDef.name] = String(raw).trim() || null;
        break;
    }
  }
  return record as unknown as PlayRecord;
}
```

- Integer fields use strict regex `^-?\d+$` (allows negative for gainLoss, rejects decimals and non-numeric)
- Leading zeros normalized via `Number("0012")` producing `12`
- Normalization runs before hashing and persistence

### Update `validateField` for integers
Strengthen integer validation to reject decimals and non-numeric strings using the same strict regex pattern, ensuring inline validation matches commit-gate behavior.

---

## 3. Proposal-Gated Commit in `src/engine/transaction.tsx`

### Add `backToEdit` callback
Sets state back to `"candidate"` from `"proposal"`.

### Guard `commitProposal`
Add early return `if (state !== "proposal") return false` at the top of `commitProposal`.

### Expose `backToEdit` in context
Add to `TransactionContextValue` interface and provider value.

---

## 4. DraftPanel UI Updates in `src/components/DraftPanel.tsx`

### State-aware border colors
- `state === "candidate"` uses `border-candidate bg-candidate-muted`
- `state === "proposal"` uses `border-proposal bg-proposal-muted`

### Read-only fields in proposal state
Add `disabled={isProposal}` to all Input, Select, and Switch components.

### Button flow
- **Candidate state**: Show "Review Proposal" button only. No Commit button.
- **Proposal state**: Show "Back to Edit" button (returns to candidate) and "Commit" button (amber/proposal themed). Hide "Review Proposal."
- "Clear Draft" always available.

### Header text
- Candidate: "Draft Entry"
- Proposal: "Proposal Review"

### Segment banner
Update background color class from `bg-draft/20` to state-aware: `bg-candidate/20` or `bg-proposal/20`.

---

## 5. No-Op Overwrite Blocking

### `src/engine/transaction.tsx` (`confirmOverwrite`)
Before calling `dbCommitPlay`, compare `pendingNormalized` against `existingPlay` field-by-field using normalized values. If all fields match, set a commit error `{ _noop: "No changes detected — overwrite blocked" }` and return false.

### `src/components/OverwriteReview.tsx`
- Compare using `pendingNormalized` (from context) instead of raw `candidate` to ensure normalized value comparison
- When `changedFields.length === 0`, disable the "Confirm Overwrite" button
- Add `pendingNormalized` to the transaction context interface so OverwriteReview can access it

### `src/engine/transaction.tsx` (context)
Expose `pendingNormalized` in the context value so OverwriteReview can diff normalized values against `existingPlay`.

---

## 6. StatusBar + Other References

### `src/components/StatusBar.tsx`
- Update the RYG indicator: candidate state uses `bg-candidate` (neutral), proposal uses `bg-proposal` (amber)
- Update state labels if needed

### `src/components/OverwriteReview.tsx`
- Replace `bg-draft` / `text-draft` references with `bg-proposal` / `text-proposal`

---

## Files Changed

| File | Changes |
|------|---------|
| `src/index.css` | Replace draft tokens with candidate + proposal tokens |
| `tailwind.config.ts` | Replace `draft` color with `candidate` + `proposal` |
| `src/engine/validation.ts` | Add `normalizeToSchema()`, strengthen integer validation |
| `src/engine/transaction.tsx` | Add `backToEdit`, guard commit on proposal state, expose `pendingNormalized`, add no-op detection |
| `src/components/DraftPanel.tsx` | Proposal-gated commit UI, state-aware colors, read-only in proposal, button flow |
| `src/components/OverwriteReview.tsx` | Use normalized values for diff, disable confirm on no-op, update color classes |
| `src/components/StatusBar.tsx` | Update indicator colors for candidate vs proposal |

