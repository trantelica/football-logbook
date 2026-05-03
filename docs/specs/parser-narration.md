# Football Engine — Parser & Narration Spec

**Version:** v2.0 draft  
**Status:** Working spec  
**Primary purpose:** define how coach narration becomes candidate/proposal data without bypassing schema, lookup governance, or commit discipline.  
**Canonical owner:** product owner / coach  
**Implementation owner:** Lovable / code implementation agents  
**Repo path:** `docs/specs/parser-narration.md`

---

## 1. Conclusion

Parser and narration support should make the coach faster without making the data less trustworthy.

The parser may interpret natural football language, but it must only produce candidate evidence and proposal patch values. It must not commit. It must not create schema keys. It must not silently append lookup values. It must not overwrite committed fields without the normal proposal and overwrite review path.

The governing flow is:

```text
coach narration → transcript / text input → candidate evidence → governed proposal patch → validate → coach review → commit
```

The proposal remains the review surface. The committed row remains the ledger.

---

## 2. Non-Negotiables

1. Parser output is not committed data.
2. Parser output must pass lookup/reference governance where applicable.
3. Parser output must map to canonical internal field keys before proposal.
4. Parser output must not create new schema fields.
5. Parser output must not bypass overwrite review.
6. Parser output must be pass-scoped.
7. Parser uncertainty must be visible.
8. AI, if used, is advisory and subordinate to deterministic validation.
9. Coach review is required before commit.
10. Silent proposal assembly is allowed; silent commitment is not.

---

## 3. Scope

This spec governs:

1. typed narration
2. voice transcript handling
3. guided-session narration
4. Pass 1 play metadata parsing
5. Pass 2 personnel narration boundaries
6. Pass 3 grade narration parsing
7. actor phrase extraction
8. common speech-to-text normalization
9. parser confidence/ambiguity handling
10. AI-assisted candidate behavior
11. provenance and evidence expectations

This spec does not govern:

1. export headers
2. lookup store persistence details
3. full UI layout
4. complete AI prompt engineering
5. future defense/kicking parser expansion except activation constraints

---

## 4. Parser Role in the Architecture

The parser operates before proposal validation.

```text
Input Layer
  → Parser / Narration Interpreter
  → Candidate Evidence
  → Governance + Normalization
  → Proposal Patch
  → Validation
  → Coach Review
  → Commit
```

The parser may identify values. The deterministic engine decides whether those values are valid proposal data.

---

## 5. Candidate Evidence Model

Parser output should preserve enough evidence to explain why a value was proposed.

Conceptual shape:

```ts
type CandidateEvidence = {
  fieldKey: string;
  proposedValue: unknown;
  sourceText: string;
  source: "parser" | "ai" | "coach";
  confidence?: "clear" | "ambiguous" | "low";
  notes?: string[];
};
```

Candidate evidence may be transformed into a proposal patch only after governance and normalization.

---

## 6. Proposal Patch Output

The parser may contribute to a proposal patch.

Conceptual shape:

```ts
type ParserProposalPatch = Partial<PlayRecord>;
```

Rules:

1. Patch keys must be canonical internal keys from the data contract.
2. Patch values must be normalized before proposal validation.
3. Governed values must be checked against lookup/reference governance.
4. Uncertain values should be flagged, not silently applied.
5. Parser patch values remain editable before commit.

---

## 7. Provenance Expectations

Parser-derived values should carry provenance into proposal review where practical.

Recommended provenance tag:

```text
parser
```

AI-assisted values should carry:

```text
ai
```

If AI and parser agree, implementation may show combined provenance or choose the more useful explanation, but validation remains deterministic.

---

## 8. Pass Scoping

Parser behavior must respect active pass.

| Active Pass | Parser Scope |
|---:|---|
| Pass 1 | basic play metadata, governed playbook values, actors, outcome |
| Pass 2 | personnel assignment only, unless explicit cross-pass edit flow exists |
| Pass 3 | blocking grades only, unless explicit cross-pass edit flow exists |

A parser running in Pass 2 must not behave like a second Pass 1 parser by default.

A parser running in Pass 3 must not mutate play metadata or personnel by default.

---

## 9. Pass 1 Narration Scope

Pass 1 parser may extract:

| Field | Example Phrase | Proposed Field |
|---|---|---|
| down | “first and ten” | `dn = 1`, `dist = 10` |
| distance | “second and six” | `dn = 2`, `dist = 6` |
| yard line | “on our own 20” | `yardLn` |
| hash | “middle of the field” | `hash = M` |
| formation | “in Black” | `offForm = Black` |
| play | “running 26 Punch” | `offPlay = 26 Punch` |
| motion | “3 Across motion” | `motion = 3 Across` |
| result | “we got four yards” | `gainLoss = 4`, `result = Rush` if clear |
| rusher | “number three was the ball carrier” | `rusher = 3` |
| passer | “number seven threw it” | `passer = 7` |
| receiver | “complete to eighty-four” | `receiver = 84` |
| penalty | “holding on us” | `penalty` candidate |

Pass 1 parser must route governed values through lookup governance before proposal validity.

---

## 10. Actor Phrase Extraction

Actor extraction should support natural coach phrases.

### 10.1 Rusher / Ball Carrier

Examples that should map to `rusher`:

```text
number three was the ball carrier
#3 was the ball carrier
three carried it
three on the carry
ball carrier was 3
rusher was 3
3 ran it
```

### 10.2 Passer

Examples that should map to `passer`:

```text
seven threw it
quarterback seven
passer was 7
7 on the pass
```

### 10.3 Receiver

Examples that should map to `receiver`:

```text
complete to 84
receiver was 84
84 caught it
thrown to 84
```

### 10.4 Actor Ambiguity

If a jersey number is mentioned without a clear actor role, the parser should not silently choose an actor field.

Example:

```text
84 made a good block
```

In Pass 1, this is not enough to set `receiver = 84`.

---

## 11. Governed Playbook Value Parsing

### 11.1 Formation Parsing

Formation values map to `offForm`.

Examples:

```text
in Black
out of Trips Right
formation is Doubles
we are in Gun Doubles Tight
```

The parser should avoid appending redundant words to canonical labels.

Bad candidate:

```text
Black Formation
```

Better candidate:

```text
Black
```

### 11.2 Play Parsing

Play values map to `offPlay`.

Examples:

```text
running 26 Punch
we ran 38 Punch
play is 44 Counter
called 3 Step Slant
```

Avoid redundant suffixes:

Bad candidate:

```text
26 Punch Play
```

Better candidate:

```text
26 Punch
```

### 11.3 Motion Parsing

Motion values map to `motion`.

Examples:

```text
3 Across motion
motion is rocket
he motions across
```

The parser must not ignore a motion just because formation and play are also new or unknown in the same narration.

---

## 12. Multiple Unknown Governed Values

A single narration may contain multiple unknown governed values.

Example:

```text
We are in Black, motion is 3 Across, running 26 Punch.
```

If `Black`, `3 Across`, and `26 Punch` are all unknown, the system must queue or handle all governed unknowns without losing candidate context.

Rules:

1. Each unknown governed value should be tracked separately.
2. Resolving one unknown must not discard the others.
3. After each append/correction, normalization should rerun.
4. The final proposal must show all resolved values and dependents before commit.
5. The system must avoid infinite modal loops.

---

## 13. Pass 2 Personnel Narration Scope

Pass 2 narration may assist personnel assignment only.

Examples:

```text
LT is 72, LG is 55, center is 60
X is 11, Y is 84, one is 3, two is 4, three is 8, four is 22
```

Pass 2 parser may map aliases to canonical slots:

```text
Z is 11 → pos1 = 11, if Z alias maps to slot 1
```

Rules:

1. aliases map to canonical slots before proposal
2. slot assignments remain jersey numbers
3. off-roster detection applies
4. duplicate detection applies
5. parser must preserve assignment context
6. Pass 2 parser must not update Pass 1 play metadata by default

---

## 14. Pass 3 Grade Narration Scope

Pass 3 parser may extract blocking grades.

Examples:

```text
LT plus one
LG zero
center minus one
Y got a one
X got a negative two
one got a three
```

### 14.1 Grade Field Mapping

| Spoken Slot | Canonical Slot | Internal Grade Key |
|---|---|---|
| LT / left tackle | LT | `gradeLT` |
| LG / left guard | LG | `gradeLG` |
| C / center | C | `gradeC` |
| RG / right guard | RG | `gradeRG` |
| RT / right tackle | RT | `gradeRT` |
| X | X | `gradeX` |
| Y | Y | `gradeY` |
| one / 1 | 1 | `grade1` |
| two / 2 | 2 | `grade2` |
| three / 3 | 3 | `grade3` |
| four / 4 | 4 | `grade4` |

### 14.2 Allowed Grade Values

```text
-3, -2, -1, 0, 1, 2, 3
```

Out-of-range grades must be rejected or flagged before commit.

---

## 15. Collapsed Grade Tokens

The parser should handle compact grade tokens.

Examples:

```text
Y1 → gradeY = 1
X-1 → gradeX = -1
LT2 → gradeLT = 2
RG-2 → gradeRG = -2
```

Important distinction:

```text
Y1
```

means:

```text
gradeY = 1
```

It does not mean:

```text
grade1 = Y
```

The parser must distinguish slot identifiers from grade values.

---

## 16. Speech-to-Text Normalization

Speech-to-text may produce plausible but wrong phrases.

### 16.1 “go to” vs “got a”

Common issue:

```text
Y go to one
```

Likely intended:

```text
Y got a one
```

Potential normalized proposal:

```text
gradeY = 1
```

This normalization is allowed only in Pass 3 grade context.

### 16.2 Number Word Normalization

The parser may normalize common number words:

```text
one → 1
two → 2
three → 3
four → 4
zero → 0
minus one → -1
negative two → -2
plus three → 3
```

### 16.3 Jersey Number Normalization

The parser may normalize jersey number phrases:

```text
number three → 3
number eighty-four → 84
#84 → 84
```

Ambiguity remains possible and must be surfaced when role context is missing.

---

## 17. AI-Assisted Narration

AI may assist where language is messy, incomplete, shorthand-heavy, or context-dependent.

AI may:

1. suggest candidate evidence
2. suggest still-open field values
3. identify ambiguity
4. suggest likely governed lookup mapping
5. help produce coach-friendly proposal summaries

AI must not:

1. commit data
2. bypass lookup governance
3. bypass validation
4. silently choose among ambiguous values
5. create schema keys
6. rewrite committed rows
7. override deterministic parser values without surfacing the difference

AI should produce candidate evidence or candidate patches, not committed rows.

---

## 17A. AI-Assisted Section Interpretation and Parser Crosscheck

### 17A.1 Purpose

The deterministic parser should not be responsible for understanding every possible form of natural coach narration.

The intended interpretation model is:

```text
raw section text
  → speech-to-text normalization
  → deterministic parser for hard evidence
  → section-aware lookup scanner
  → AI interpretation and parser crosscheck
  → governed proposal patch
  → validation
  → coach review
  → commit
```

The parser extracts high-confidence structured evidence.
The lookup scanner identifies known governed values that appear in the correct section.
The AI reviews the whole utterance, parser patch, section intent, and lookup evidence.
The deterministic engine, lookup governance, and coach remain the final gates.

AI is an interpreter and critic, not the source of committed truth.

### 17A.2 Layer Responsibilities

| Layer | Responsibility | Must Not Do |
|---|---|---|
| Speech-to-text normalization | Correct common dictation artifacts before parsing | Mutate coach-visible raw transcript |
| Deterministic parser | Extract high-confidence explicit values | Pretend confidence when phrase structure is ambiguous |
| Section lookup scanner | Detect known lookup values in section-owned fields | Apply lookup values outside section scope |
| AI interpretation | Propose missing values, flag suspicious parser assignments, explain ambiguity | Commit, silently overwrite, silently append lookup values |
| Lookup governance | Validate governed values and collect dependents | Invent values |
| Coach review | Accept, correct, add, reject, or leave unresolved | Be bypassed |

### 17A.3 Section Intent Awareness

AI and lookup scanning must be section-aware.

Each Pass 1 section has a different interpretation intent:

| Section | Primary Intent | AI / Lookup Scan Focus |
|---|---|---|
| Situation | down, distance, yard line, hash | `dn`, `dist`, `yardLn`, `hash`; do not treat playbook words as governed values unless explicitly relevant |
| Play Details | formation, play, motion | `offForm`, `offPlay`, `motion`; governed lookup values are highly relevant |
| Play Results | result, gain/loss, actors, penalty | `result`, `gainLoss`, `rusher`, `passer`, `receiver`, `penalty` |

Example:

```text
Trips
```

In Play Details, `Trips` may be strong evidence for `offForm` if it exists in the formation lookup.

In Situation, `Trips` should not be treated as a formation candidate merely because the word appears.

### 17A.4 Section-Aware Lookup Scanner

Before AI interpretation, the system should scan section text for known lookup values relevant to that section.

For Play Details, scan:

```text
offForm lookup values
offPlay lookup values
motion lookup values
```

The scanner should produce evidence, not committed data.

Conceptual shape:

```ts
type SectionLookupEvidence = {
  sectionId: "situation" | "playDetails" | "playResults";
  fieldKey: "offForm" | "offPlay" | "motion" | "penalty";
  matchedValue: string;
  matchType: "exact" | "case_insensitive" | "fuzzy";
  sourceText: string;
  confidence: "high" | "medium" | "low";
};
```

Lookup evidence should be passed to AI and proposal assembly.

Rules:

- Exact lookup matches in the correct section are strong evidence.
- Fuzzy lookup matches may be proposed but should remain reviewable.
- Lookup evidence must respect section ownership.
- Lookup evidence must not silently update committed rows.
- Unknown governed values still require lookup governance before commit validity.

### 17A.5 AI Crosscheck Role

AI should review the full section context, not only unresolved fields.

AI should receive:

```text
section id
section-owned fields
raw section text
normalized text
deterministic parser patch
parser evidence, if available
section lookup evidence
current candidate values
currently unresolved fields
known lookup values for governed fields
known speech-to-text confusions
active pass
```

AI may return:

- proposals for unresolved fields
- candidate corrections for parser-filled fields
- warnings about suspicious parser output
- "no evidence" findings for fields the parser or AI should not fill
- ambiguity notes

AI must not:

- commit data
- silently overwrite parser, coach, predicted, or committed values
- silently append lookup values
- bypass lookup governance
- create schema keys
- mutate committed rows
- invent values when evidence is weak

### 17A.6 Parser Challenge Behavior

If deterministic parsing produces a value that appears inconsistent with the utterance, AI may challenge it.

Example:

```text
The play is 39 Reverse Pass from Shiny formation.
```

Bad parser output:

```text
offPlay = "39 Reverse"
offForm = "Pass From Shiny"
motion = null
```

AI crosscheck should be allowed to report:

```text
offPlay appears truncated; likely intended value is "39 Reverse Pass"
offForm appears over-captured; likely intended value is "Shiny"
motion was not mentioned
```

AI may propose a correction patch:

```json
{
  "corrections": {
    "offPlay": {
      "currentValue": "39 Reverse",
      "proposedValue": "39 Reverse Pass",
      "confidence": "high",
      "reason": "Phrase 'The play is 39 Reverse Pass' directly names the play."
    },
    "offForm": {
      "currentValue": "Pass From Shiny",
      "proposedValue": "Shiny",
      "confidence": "high",
      "reason": "Phrase 'from Shiny formation' directly names the formation."
    }
  },
  "noEvidenceFor": ["motion"]
}
```

Correction proposals must flow through the same collision, overwrite, proposal, and lookup governance paths as any other system patch.

### 17A.7 AI Output Shape

Recommended AI interpretation response:

```ts
type AISectionInterpretation = {
  proposals?: Record<string, {
    value: unknown;
    confidence: "high" | "medium" | "low";
    basis: string;
    matchType?: "exact_lookup" | "fuzzy_lookup" | "candidate_new" | "parser_supported";
  }>;

  corrections?: Record<string, {
    currentValue: unknown;
    proposedValue: unknown;
    confidence: "high" | "medium" | "low";
    reason: string;
    basis: string;
  }>;

  warnings?: Array<{
    fieldKey?: string;
    severity: "info" | "warning" | "blocker";
    message: string;
    basis?: string;
  }>;

  noEvidenceFor?: string[];
};
```

Only canonical field keys may appear.

If the response includes governed values for `offForm`, `offPlay`, or `motion`, those values must still route through lookup governance.

### 17A.8 Confidence and Merge Policy

AI output should not be merged blindly.

Recommended policy:

| AI Finding | Merge Behavior |
|---|---|
| High-confidence fill for empty field | May enter proposal as AI-derived candidate |
| Exact lookup match in section-owned field | May enter proposal as lookup-supported candidate |
| Fuzzy lookup match | Proposal candidate with visible review |
| Candidate new governed value | Proposal candidate, then lookup governance |
| Correction to parser-filled empty-slot field | Collision/overwrite review if value differs |
| Correction to coach-touched field | Must not overwrite silently |
| Low-confidence proposal | Warning or clarification, not direct field fill |
| No evidence for field | Suppress hallucinated fill for that field |

### 17A.9 Speech-to-Text Confusion Context

AI should be instructed that coach narration may include dictation artifacts.

Examples:

| Intended | Possible STT Output |
|---|---|
| first and ten | first in ten |
| rusher | Russia |
| passer | pastor |
| hash | hatch or unrelated junk |
| X | ex |
| Y | why |
| complete to | completed two |
| ball carrier | bulk area / ball care |

AI may use these as interpretation hints, but must still produce reviewable candidates rather than committed data.

### 17A.10 Football Context

AI should be told it is interpreting American football play logging, not generic prose.

Minimum AI context:

```text
You are interpreting American football coach narration for a structured play log.
The coach may dictate Situation, Play Details, and Play Results separately.
Use only canonical field keys.
Respect section-owned fields.
Prefer explicit evidence and exact lookup matches.
Flag likely parser mistakes.
Do not commit.
Do not add lookup values.
Do not create schema fields.
```

Useful football assumptions:

- Formation names are usually short labels, commonly 1–3 words.
- Play names are usually short labels, commonly 1–4 words.
- Motion names are usually short labels and often include the word "motion" or match an existing motion lookup.
- "from X formation" usually indicates `offForm = X`.
- "play is X," "run X," "running X," or "called X" usually indicates `offPlay = X`.
- Do not infer motion unless motion is explicitly mentioned or matches an existing motion lookup with strong section evidence.

### 17A.11 Governance Preservation

AI crosscheck must preserve the governing architecture:

```text
candidate → proposal → validate → commit → audit → export
```

Rules:

- AI output is candidate/proposal evidence only.
- AI corrections must not mutate committed rows.
- AI corrections to non-empty fields must use collision/overwrite review.
- Governed values must route through lookup governance.
- New lookup values must not be silently appended.
- Coach review remains required before commit.
- Hudl export schema must not change.

### 17A.12 When to Prefer Parser vs AI

Use deterministic parser when:

- exact anchors exist
- phrase is stable and low-risk
- value is numeric or enum-simple
- false positives can be tightly controlled

Use AI interpretation when:

- natural phrasing varies
- parser output appears contradictory
- lookup values appear in section text without clean anchors
- phrase order is flexible
- speech-to-text corruption is likely
- parser fills a governed value that looks unusually long or sentence-like

For governed playbook values, parser output longer than normal lookup-label shape should be treated with suspicion.

Examples of suspicious governed candidates:

```text
Pass From Shiny
The Ball Carrier
Run The Play Door Open And
```

### 17A.13 Open Design Questions

Implementation should inspect and decide:

- whether AI crosscheck runs every time a section proposal is updated
- whether AI crosscheck runs only when governed fields are missing, suspicious, or conflicting
- how to cap token/cost use
- how to present AI correction warnings without slowing the coach
- how to test AI behavior deterministically where possible
- whether AI output should be mocked in tests

---

## 18. Guided Session Narration

North-star flow:

```text
Coach speaks naturally.
System assembles proposal silently.
Coach reviews proposal explicitly.
System never commits silently.
```

The coach should not need to manage parser stages.

The system may internally perform:

1. deterministic parsing
2. lookup normalization
3. AI-assisted interpretation
4. proposal sanity check
5. validation

But the coach should see one clean proposal surface.

---

## 19. Proposal Presentation Expectations

A narration-generated proposal should show:

1. proposed field values
2. unresolved fields, if any
3. governed lookup issues, if any
4. suspicious ambiguity, if any
5. provenance indicators where useful
6. coach actions: accept, correct, pause, restart/discard

The proposal should be coach-friendly, not raw JSON.

Raw JSON may remain available for debugging or developer inspection.

---

## 20. Ambiguity Handling

The parser should flag ambiguity instead of pretending certainty.

Examples:

| Narration | Problem | Expected Behavior |
|---|---|---|
| “number three made a play” | no actor role | do not set `rusher`, `passer`, or `receiver` silently |
| “we got three or four” | uncertain gain | ask/flag or use latest correction if clearly stated |
| “Black right” | formation or strength? | route through lookup/surface ambiguity |
| “Y1” in Pass 1 | not grade context | do not set `gradeY` unless active Pass 3 |

---

## 21. Correction Handling

Coach narration may self-correct.

Example:

```text
we got 3, no 4 yards
```

Preferred interpretation:

```text
gainLoss = 4
```

Rules:

1. clear self-correction may override earlier same-field candidate
2. correction should remain visible in proposal
3. ambiguous correction should be flagged
4. self-correction must not affect unrelated fields

---

## 22. Parser Failure Behavior

If parser fails or is uncertain:

1. leave field blank rather than inventing a value
2. surface unresolved items if important
3. allow manual correction
4. preserve transcript/text evidence
5. do not block unrelated valid proposal fields unless required by governance

Failure should degrade to manual proposal editing, not system paralysis.

---

## 23. Implementation Guardrails for Lovable

### 23.1 Good Inspect Request

```text
Inspect parser/narration behavior only. Do not modify code.
Report how Pass 1 actor extraction, Pass 2 personnel narration, and Pass 3 grade narration currently map text to proposal fields.
Flag any path where parser output can directly mutate committed rows.
Do not recommend broad refactors.
```

### 23.2 Good Patch Request

```text
Make the smallest targeted parser patch.
Add support for phrases like “number three was the ball carrier” mapping to rusher = 3 in Pass 1.
Do not change Hudl export headers.
Do not change Pass 2 personnel keys.
Do not change Pass 3 grade mappings.
Ensure the value appears in proposal review before commit.
Add or update a focused parser test if a test surface exists.
```

### 23.3 Bad Request

```text
Make the parser understand football better.
```

Too broad. That request opens the swamp gate.

---

## 24. Acceptance Criteria

### 24.1 Architecture Acceptance

The parser passes if:

1. parser output enters candidate/proposal state only
2. parser output never commits directly
3. governed values route through lookup governance
4. proposal review is required before commit
5. parser values use canonical internal field keys
6. parser does not create schema keys
7. pass scoping is enforced

### 24.2 Pass 1 Acceptance

Pass 1 parser passes if:

1. formation phrases map to `offForm` candidate values
2. play phrases map to `offPlay` candidate values
3. motion phrases map to `motion` candidate values
4. “number three was the ball carrier” maps to `rusher = 3`
5. clear passer phrases map to `passer`
6. clear receiver phrases map to `receiver`
7. self-correction like “3, no 4 yards” resolves to latest value where clear
8. unknown governed values trigger lookup governance

### 24.3 Pass 2 Acceptance

Pass 2 parser passes if:

1. slot narration maps to canonical personnel slots
2. aliases map to canonical slots before proposal
3. off-roster jerseys are preserved in assignment context
4. duplicate jerseys are detected by validation
5. Pass 2 parser does not update Pass 1 fields by default

### 24.4 Pass 3 Acceptance

Pass 3 parser passes if:

1. grade narration maps to correct grade fields
2. collapsed tokens like `Y1` map to `gradeY = 1`
3. “go to” may normalize to “got a” in grade context
4. out-of-range grades are rejected or flagged
5. Pass 3 parser does not update Pass 1 or Pass 2 fields by default

---

## 25. Open Issues / Review Items

| ID | Issue | Recommendation |
|---|---|---|
| PN-001 | Confirm current parser support for "number three was the ball carrier" | Likely targeted patch candidate |
| PN-002 | Confirm current handling of multiple unknown governed values in one narration | Keep as lookup/parser regression case |
| PN-003 | Confirm current Pass 2 parser cannot unintentionally mutate Pass 1 fields | Inspect before further Pass 2 work |
| PN-004 | Confirm current Pass 3 handling of "go to" vs "got a" | Likely targeted normalization patch |
| PN-005 | Define how much transcript evidence is visible in normal coach UI | Defer to UX spec |
| PN-006 | Define future AI candidate evidence shape | Defer to AI-specific implementation plan |
| PN-007 | AI currently appears to fill unresolved fields only and may not challenge bad deterministic parser output | Inspect AI prompt and add section-aware crosscheck design |
| PN-008 | Need section-aware lookup scanner for known values in coach text | Design before implementation |
| PN-009 | Need merge policy for AI corrections to parser-filled fields | Use collision/overwrite + lookup governance |
| PN-010 | Need token/cost guardrail for AI crosscheck | Run only on section update / review proposal, not every keystroke |

---

## 26. Final Operating Rule

The parser is a scout, not the referee.

It can point to what it thinks it saw. The deterministic engine and the coach decide what enters the record.
