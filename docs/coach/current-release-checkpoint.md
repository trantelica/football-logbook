# Current Release Checkpoint

> Date: 2026-06-07
> Status: Controlled beta
> Test baseline: 943 / 943 passing

---

## Accepted Features

| Feature | Status |
|---|---|
| Pass 1 — Situation & Play Details | Accepted |
| Pass 2 — Personnel | Accepted |
| Pass 3 — Blocking Grades | Accepted |
| Hudl CSV Export | Accepted |
| Session Archive Export | Accepted |
| Session Archive Import / Restore-Only v1 | Accepted |
| Pass 3 AI-Assisted Grading Fallback | Accepted |
| Branding Polish | Accepted |

---

## Core Guardrails

These rules are enforced by the app and are not configurable:

1. **Strict transaction lifecycle**: candidate → proposal → validate → commit → audit
2. **No silent commit**: Commit requires an explicit button press and confirmation.
3. **No silent overwrite**: Changing a committed play triggers an explicit overwrite review.
4. **Deterministic engine remains authoritative**: The deterministic parser runs first; AI only fills what the parser leaves unresolved.
5. **AI is advisory only**: AI proposes, never commits, never overwrites parser-resolved fields, and never bypasses validation.
6. **Hudl CSV exports committed rows only**: Empty or transient slots do not leak into export output.
7. **Session archive import is restore-only**: Imports always create a new game; they do not merge into existing sessions or replace season configuration.

---

## Test Baseline

- **Full suite**: 943 / 943 passing
- No known regressions

---

## Schema & Export Versions

| Item | Value |
|---|---|
| SCHEMA_VERSION | 2.1.0 |
| APP_VERSION | 1.0.0 |
| EXPORT_FORMAT_VERSION | 8.1.0 |
| SESSION_ARCHIVE_FORMAT_VERSION | 8.2.0 |

---

## What This Build Is For

This build is ready for controlled beta use by coaches who need:

- Voice-assisted or manual logging of offensive plays
- Personnel tracking with carry-forward seeding
- Blocking grade capture with parser and AI-assisted fallback
- Clean Hudl CSV export for committed data
- Session backup and restore as new games

It is not yet a full defensive or special-teams solution. See `known-limits.md` for the complete user-facing boundary.
