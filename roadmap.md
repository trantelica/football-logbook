# Current work
- [x] Slice D1: football-aware transcription service with season vocabulary hints.
- [x] Slice D2: covered — spoken numbers already converted to digits; near-miss playbook words already offered by Lookup Assist.
- [x] Slice D3a: hold-Space push-to-talk (Pass 1 active section, Pass 2, Pass 3); release stops mic only.
- [x] Slice D3b: release-to-update (waits for the football-aware transcript, then runs Update Proposal; review only).
- [x] Slice D3c: "heard vs understood" read-back under each Pass 1 card (Pass 2 already shows a parse preview).
- [x] Slice E layout: Pass 1 "Derived from lookup" folded (auto-opens on commit errors).
- [x] Slice E (perf part): faster save-history numbering, cached playbook-term matching.

- [x] Commit hotkeys: shared N / Y / L actions + Ctrl/Cmd chords in all three passes (Commit & Stay is new).

# Pass 4 — Defense (plan: .lovable/plan/pass-4-defensive-plays-2026-10-16.md)
- [x] Ensure non-enum defensive lists support reviewed additions like OFF PLAY.
- [x] Slice 1: defensive fields, export columns (appended), defensive vocabularies declared.
- [x] Slice 2: Pass 4 shell with all four defensive cards (D slots only), reusing the Pass 1 card engine.
- [ ] Slice 3: Results + Playmakers cards, roster matching, defensive rules.
- [ ] Slice 4: dictation cue words, defensive yard-line sign flip, AI fallback.
- [x] Current request: defensive side-aware yard-line dictation and reviewed AI fallback; verified both signs, live AI suggestions, explicit list review, commit and reload (1,096 tests passed).
- [ ] Slice 5: PassRail status, ledger columns, export-check tests (docs done).

## Parked (do not start until user says go)
- [ ] Partial game import: bring a partial file from another source into an existing game; match by play number; imported values arrive as reviewed proposals, never overwrite committed data.
- [ ] Persistent storage beyond the browser: cloud backup/sync of seasons and games that survives browser clearing and works across devices; browser stays the working copy.

## Coach usability enhancements (parked)
- [ ] Keep Tab inside the work area. In Pass 2 Personnel, Tab from the QB jersey box jumps to the browser address bar. Tab should wrap from the last box to the first (Shift+Tab the reverse), and the same should hold in every pass. Parked until the coach says go.
