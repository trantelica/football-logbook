# Slice A — Section-Aware AI Scoping (Pass 1)

Approved scope only. Constrain Pass 1 AI proposals to fields owned by the currently active Pass 1 section. Additive, backward-compatible.

## Changes

### 1. `src/engine/aiEnrichClient.ts`
- Import `getSection`, `SectionId` from `./sectionOwnership`.
- Add optional `activeSection?: SectionId` to `fetchAiProposal` opts.
- After computing `aiEligibleUnresolved`, if `activeSection` is provided, intersect with `getSection(activeSection).ownedFields`. If empty after intersection, return early `{ proposal: {}, error: "All AI-eligible fields are already resolved" }`.
- Pass `activeSection` in the edge-function body (additive, ignored by old function until deployed).
- After receiving the AI response and normalizing canonical position keys, defensively drop any key not in the section's owned set when `activeSection` is provided.

### 2. `src/components/Pass1SectionPanel.tsx` (line ~554)
- Pass `activeSection: id` (the current section id already in scope as `id`) into the `fetchAiProposal` call. No other behavior change — the existing `ownedSet` post-filter remains as belt-and-suspenders.

### 3. `src/components/DraftPanel.tsx` (line ~980)
- This call is the cross-section "Suggest Fills" trigger and is NOT bound to a single Pass 1 section. Leave `activeSection` unset (omitted) so behavior is unchanged. Add a code comment noting Slice A scopes Pass 1 section-bound calls only.

### 4. `supabase/functions/ai-enrich/index.ts`
- Accept optional `activeSection` from the request body.
- If present, append a single line to the system prompt: `Active Pass 1 section: <id>. Only propose values for fields owned by this section.`
- In the final defensive `filtered` step, additionally drop keys not in `unresolvedFields` (already done) — no schema change needed because `unresolvedFields` is already section-intersected on the client. No new server-side section table needed; client is the authoritative gate.

### 5. `src/test/aiEnrichment.test.ts`
Add a `describe("section-aware AI scoping (Slice A)")` block with mocked `supabase.functions.invoke`:
- Test 1: `activeSection="playDetails"`; mock AI returns `{ result: "Rush", offForm: {value:"Shiny",matchType:"exact"}, offPlay:"39 Reverse Pass" }`. Expect proposal contains `offForm`, `offPlay`; does NOT contain `result`.
- Test 2: `activeSection="playResults"`; mock AI returns `{ offForm: {value:"Shiny",matchType:"exact"}, result:"Rush", gainLoss:5 }`. Expect proposal contains `result`, `gainLoss`; does NOT contain `offForm`.
- Test 3: For any section, derived fields (`offStrength`, `playType`, `playDir`, `personnel`, `motionDir`) never appear in the body's `unresolvedFields`. Capture invoke body via mock and assert.
- Test 4: `candidate_new` governed match passes through unchanged (matchType preserved) when in-section.
- Test 5: When `activeSection` is omitted (DraftPanel path), no section filter is applied — preserves backward compat.

Use `vi.mock("@/integrations/supabase/client", ...)` to stub `supabase.functions.invoke` and capture the request body.

## Out of scope (deferred)
- No section-aware lookup scanner.
- No AI crosscheck/correction shape.
- No Pass 2/3 AI.
- No suspicion signals.
- No transaction model changes; no provenance changes.
- No Hudl/canonical/governance changes.

## Acceptance
All 5 new tests pass; existing aiEnrichment, transcriptNormalize, hudlExport, and proposal tests continue to pass.
