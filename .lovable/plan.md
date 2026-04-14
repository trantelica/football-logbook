

# Design Note Amendment: Hudl-Centered Location Mapping Authority

## What changes in the design note

A new section (inserted between current Section 7 "Lookup Vocabulary Strategy" and Section 8 "Recommended Initial AI Scope") and corresponding updates to the AI Context Packet (Section 3).

---

## New Section: Hudl-Centered Location Mapping Authority

### The existing model

The engine uses a signed yardline address system with an internal index scale (`yardLnToIdx` / `idxToYardLn`) anchored to an immutable `fieldSize` (80 or 100) stored in `GameMeta`. Negative yardLn values represent one territory, positive values represent the other. The midfield boundary, valid range, and goal-line index are all derived deterministically from `fieldSize`. This is the authoritative location model — it drives prediction, commit-gate QC, and Hudl export.

### Location-related fields under this constraint

| Field | Why constrained |
|---|---|
| `yardLn` | Must be a valid signed integer within `[-(fieldSize/2 - 1), +(fieldSize/2)]` range. "Our" vs "their" maps to sign. |
| `hash` | L/M/R enum — not index-dependent, but contextually tied to field position |
| `gainLoss` | Integer that drives index arithmetic for next-play prediction |
| `dist` | Distance to first down — bounded by distance-to-goal (`fieldSize - currentIdx`) |

### Rules for AI

1. **AI must not invent its own location interpretation.** All yardline values the AI proposes must be valid within the `fieldSize`-based index model. The AI context packet tells the AI the active `fieldSize` and the valid yardline range — the AI must stay within it.

2. **AI must stay consistent with Hudl-centered mapping.** The signed address convention (negative = own territory, positive = opponent territory) is authoritative. The AI context packet includes this convention explicitly so the AI does not invent an alternative.

3. **Deterministic prediction remains source of truth.** When `computePrediction` produces a `yardLn`, `dn`, or `dist` value, that value takes precedence. AI may only propose location fields when prediction is suspended or ineligible (e.g., missing prerequisites, possession change, PAT context).

4. **Omit rather than guess.** If the coach says "on the 30" without "our" or "their" context, and no other resolved fields disambiguate possession side, the AI must omit `yardLn` entirely.

### Representation in the AI Context Packet (Section 3 update)

The `AIContextPacket` gains a `locationMapping` block sent on every call where `yardLn`, `gainLoss`, or `dist` are among the unresolved fields:

```text
locationMapping: {
  fieldSize: 80 | 100,
  validYardLnRange: { min: -39, max: 40 }  // derived from fieldSize
  convention: "negative = own territory, positive = opponent territory",
  midfield: 40,  // fieldSize / 2
  predictionActive: boolean,  // true if computePrediction produced a value for this slot
  predictedYardLn: number | null  // if prediction produced a value, AI must not contradict it
}
```

When `predictionActive` is true and `predictedYardLn` is non-null, AI must not propose `yardLn` at all — the deterministic engine already resolved it. The `yardLn` field would not appear in `unresolvedFields` in that case (it is already claimed by `predictedFields` provenance), but this explicit flag serves as a redundant safety signal in the prompt.

### Phraseology guidance interaction

The baseline phraseology for `yardLn` (Section 6) already captures "our/their" as possession clues. The `locationMapping` block gives the AI the numeric framework to apply those clues correctly. Together they form the complete location interpretation context: phraseology tells the AI *how coaches talk about location*, and `locationMapping` tells the AI *what valid location values look like*.

---

## Summary of all design note changes

1. **Section 3 (AI Context Packet)**: Add `locationMapping` block to the packet schema.
2. **New Section 7.5 (Hudl-Centered Location Mapping Authority)**: Full section as above — model description, constrained fields, four rules, packet representation, phraseology interaction.
3. **Section 8 (Recommended Initial AI Scope)**: Add a note under `yardLn` and `gainLoss` that these are subject to the location mapping constraint.
4. **Section 9 (Smallest Next Slice)**: Add a sub-step: "Include `locationMapping` in the context packet builder when location fields are unresolved."

No other sections change. No implementation yet.

