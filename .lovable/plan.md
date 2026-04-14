

# Design Note Amendment: Governed-Candidate Rule for Lookup-Backed Fields

## What changes

Replace the blanket "AI must not invent new lookup values" rule with a three-tier resolution strategy that allows AI to propose new candidate values when observation evidence is strong, routing them through the existing lookup-governance interrupt flow.

---

## 1. Revised Rule Set

**Old rule (removed):**
> For governed lookup fields, the proposed value MUST match one of the governed values EXACTLY. Do not invent new values.

**New rule:**

For lookup-backed fields (`offForm`, `offPlay`, `motion`), AI follows a priority cascade:

1. **Exact / normalized match.** If the spoken phrase matches a governed lookup value (case-insensitive, whitespace-normalized), propose that canonical value. This is the happy path.

2. **Fuzzy / alias-assisted match.** If no exact match is found, attempt substring or alias resolution against governed values (e.g., "gun trips" → "Shotgun Trips Right"). If a single high-confidence match is found, propose the canonical value. If multiple candidates match, omit the field.

3. **Governed candidate extraction.** If no lookup match is found but the observation text strongly supports a specific value (e.g., coach clearly says "purple formation"), AI may propose the raw candidate value. The proposal must be tagged with `matchType: "candidate_new"` so the system knows it is not an existing lookup entry.

4. **Governed review gate.** Any proposed value with `matchType: "candidate_new"` triggers the existing `lookupInterruptPending` flow — the coach must explicitly add the value to the lookup table, correct it, or dismiss. AI never silently promotes new vocabulary.

5. **Omit if uncertain.** If observation evidence does not strongly support a specific value, omit the field entirely.

---

## 2. Updated Field Handling for offForm / offPlay / motion

These fields become **lookup-first, governed-candidate** fields:

```text
AI proposal for a lookup-backed field:
  ┌─────────────────────┐
  │ Observation text     │
  └────────┬────────────┘
           ▼
  ┌─────────────────────┐
  │ Exact/normalized    │──match──▶ propose canonical value
  │ lookup match?       │           matchType: "exact"
  └────────┬────────────┘
           │ no
           ▼
  ┌─────────────────────┐
  │ Fuzzy/alias match?  │──match──▶ propose canonical value
  │ (single confident)  │           matchType: "fuzzy"
  └────────┬────────────┘
           │ no
           ▼
  ┌─────────────────────┐
  │ Strong observation  │──yes───▶ propose raw candidate
  │ evidence?           │           matchType: "candidate_new"
  └────────┬────────────┘
           │ no
           ▼
        OMIT field
```

The `matchType` tag is returned alongside each proposed value so the client-side filter knows which proposals need governance review.

---

## 3. Interaction with Existing Flows

**Proposal review surface:** All AI proposals (exact, fuzzy, or candidate_new) land in the same proposal review surface with `ai_proposed` provenance. No change to the review UX.

**Lookup interrupt:** When `applySystemPatch` receives a governed field value not in the lookup table, it already triggers `lookupInterruptPending`. This existing flow handles `candidate_new` proposals naturally — the coach sees the interrupt dialog and chooses to add, correct, or dismiss. No new UI needed.

**Dependent field behavior:** If a `candidate_new` value is added to the lookup table via the interrupt flow, the coach must also configure its dependent attributes (e.g., `offStrength` for a new `offForm`). This is already handled by the lookup-add flow in Configuration Mode.

---

## 4. Changes to Existing Code (What, Not How)

| Location | Change |
|---|---|
| `phraseologyBaseline.ts` | Replace "Must match exactly — do not invent" hints with "Prefer exact lookup match. If no match exists but evidence is strong, propose the candidate value and mark it as new." |
| `aiEnrichClient.ts` line 58 | Replace `governedConstraint: "MUST match exactly"` with updated constraint text explaining the cascade. |
| Edge function prompt (line 81) | Replace the "MUST match exactly" rule with the three-tier cascade instructions. Tell AI to return `matchType` per governed field. |
| Edge function response parsing | Extract `matchType` from AI response for governed fields. Pass through to client. |
| `aiEnrichment.ts` / `filterAiProposal` | Accept `candidate_new` proposals for governed fields (do not reject as collisions). The downstream `applySystemPatch` + lookup interrupt handles governance. |

---

## 5. Smallest Next Implementation Slice

1. **Update phraseology hints** for `offForm`, `offPlay` (and `motion` when added): replace "must match exactly" with the governed-candidate cascade language.

2. **Update `governedConstraint`** in `buildFieldHints` to instruct AI to prefer lookup matches but allow candidate proposals with a `matchType` tag.

3. **Update edge function prompt** to describe the three-tier cascade and instruct the AI to return `{ suggestions: { offForm: { value: "Purple", matchType: "candidate_new" } } }` for governed fields (simple string for non-governed fields).

4. **Update edge function response parsing** to unwrap the `{ value, matchType }` shape for governed fields into the flat proposal format the client expects.

5. **No UI changes needed** — the existing `lookupInterruptPending` dialog already handles unknown governed values correctly.

No fuzzy matching logic on the client side yet (tier 2 stays AI-side for now). No `motion` field added to `AI_ELIGIBLE_FIELDS` yet. No new lookup UI.

