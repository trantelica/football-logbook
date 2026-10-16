# Product Improvement Deep Dive — Dictation First

## Diagnosis (why dictation feels terrible)

All three passes capture voice through the browser's built-in speech recognition (one shared capture hook). That engine:
- Knows nothing about football or your playbook ("Trips Right", "39 Reverse Pass", jersey numbers, "H", "F", "Y").
- Restarts itself silently on pauses, drops words at boundaries, and quality varies widely by browser (good in Chrome, poor or missing elsewhere).
- Returns spelled-out numbers inconsistently ("two" vs "2" vs "to"), which the strict parser then misses.

The cleanup layer after it is a large hand-written phrase table, so every new mishearing needs a new rule. This is the root of the complaint.

## Top opportunities (ranked)

### 1. Replace browser dictation with a football-aware transcription service (biggest win)
- Record each narration as a short clip while the mic is armed; on stop, send it to the built-in AI transcription (no extra account needed).
- Pass a "vocabulary hint" built from the current season: formations, plays, motions, penalties, roster names/numbers, position letters, and the anchor words (DN, DIST, GAIN, LOSS…). This alone fixes most playbook-term errors.
- Keep the browser engine as a live preview / offline fallback so the coach still sees words appear while talking.
- Transcript remains an editable draft; nothing about Review/Commit changes.

### 2. Smarter, smaller cleanup after transcription
- Unified number normalization (words to digits, "to/too" to "2" only in number positions, "third and seven" to "3rd and 7").
- Season-aware fuzzy correction: snap near-miss words to the closest known playbook value using the existing bounded edit-distance helper, shown with the existing provenance badge so the coach sees what changed.
- Track which corrections the coach undoes, so rules can be pruned rather than grown.

### 3. Faster dictation loop (UX + speed)
- Push-to-talk on a single key (hold Space or a chosen key) for all three passes, with the existing tones.
- Auto-Update-Proposal when the mic stops (optional per-device setting), so "talk, stop, glance, N" becomes the loop.
- Show a quiet "heard vs. understood" strip: which words mapped to which field, and which were ignored — so misses are obvious without opening details.

### 4. Pass 1 layout
- Move rarely used derived lookup details into a collapsed section so Review/Commit sit directly under the narration (mirrors what was done for Pass 2/3).

### 5. Performance (measured, targeted)
- Audit sequence lookup scans every audit record per commit (measured ~48 ms at 5,000 records, grows linearly). Cache the last sequence per game in memory.
- Lookup scanner rebuilds patterns on every scan; build once per season revision.
- Shared app state recreates its value every render, re-rendering all panels per keystroke; memoize it.
- Do these only after timing on a real game export, to confirm.

## Recommended order
1. Slice D1: transcription service + vocabulary hints (opportunity 1).
2. Slice D2: number normalization + fuzzy snap with provenance (opportunity 2).
3. Slice D3: push-to-talk + auto-update on stop (opportunity 3).
4. Slice E: Pass 1 collapse, then measured performance fixes.

## Technical details
- New edge function `transcribe` calling the AI Gateway `/v1/audio/transcriptions` with default model `openai/gpt-transcribe`, multipart `file` + `prompt` (vocabulary hint, capped length), streaming on. Errors surfaced per gateway semantics (402/429 shown to coach, no silent retry loops).
- `useTranscriptCapture` gains a `MediaRecorder` path (complete WAV/WebM per utterance); interim browser text shown, replaced by service text on return. Feature-flagged per device, fallback to current behavior.
- Vocabulary builder reads season lookups + roster from existing contexts; pure function, unit tested.
- Normalization additions go into `transcriptNormalize.ts` with tests; fuzzy snap reuses `isBoundedSttMatch` and existing lookup governance (unknown values still go through the governance interrupt — no silent new lookups).
- Guardrails kept: no transaction, schema, export, carry-forward, or commit changes; AI remains advisory; deterministic parser stays authoritative.
- Audio is not stored; only the text result is kept.
