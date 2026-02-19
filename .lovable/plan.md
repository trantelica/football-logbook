

# Phase 1: Canonical Data Contract + Transaction Engine — Implementation Plan

## Overview
Build the deterministic foundation of the Football Engine: a versionable JSON-backed schema, the Candidate → Proposal → Commit state machine, IndexedDB persistence with full audit integrity, two-tier validation, and a draft-vs-committed UI. This is a local-first, single-user system with no external backend.

---

## 1. Schema Contract (Source of Truth)

A JSON schema definition imported into TypeScript, defining every play field:
- Field name, data type, allowed values (enums)
- Source: COACH / LOGIC / LOOKUP
- Default policy: null / process / predict / carryForward
- Default pass entry (0–5) for pass-aware commit gating
- Required-at-commit flag
- Schema version identifier (e.g., `"1.0.0"`)

**ODK enum**: O (Offense), D (Defense), K (Kicking), S (Segment/film artifact)

**Phase 1 field scope**: playNum, qtr, odk, series, yardLn, dn, dist, hash, offForm, offPlay, motion, result, gainLoss, twoMin

The schema is exportable, diffable, and versionable. All validation, UI rendering, and export logic derive from it.

---

## 2. Game Identity (Minimal gameMeta)

- `gameId` (UUID), `gameMeta`: opponent, date, created timestamp, schema version
- Simple "New Game" flow: opponent + date entry before logging begins
- Plays keyed by composite `gameId + playNum`

### Single Active Game Context
- Only one game active in Draft/Proposal state at a time
- Switching games clears all Candidate/Proposal state with confirmation prompt
- Active game always visible in the UI

---

## 3. Transaction State Machine

### Three States
- **Candidate** — Raw partial input, bound to active game context
- **Proposal** — Promoted candidate with touched-field tracking and inline validation
- **Committed** — Immutable snapshot written to IndexedDB

### Transition Rules
- Each state transition is an explicit user action
- No silent inference or auto-commit of any field
- Overwriting a committed row requires explicit before/after review and confirmation

### Clear Draft Control
- Dedicated "Clear Draft" button resets Candidate/Proposal state for the current play
- Does not modify committed data, audit history, or active game context
- Provides a clean exit from any draft state without requiring game switching

### Play Number Collision Handling
- At commit, if `gameId + playNum` already exists, the system enters **Overwrite Review Mode**
- Side-by-side diff of existing committed values vs. new proposal
- Explicit "Confirm Overwrite" / "Cancel" — no silent overwrites

---

## 4. Two-Tier Validation Engine

### Inline Validation (real-time, touched fields)
- Type and enum checks on touched fields as the coach edits
- **playNum parsing**: must be finite integer > 0; rejects non-numeric input ("12a", empty, NaN), rejects decimals (12.5), normalizes leading zeros ("0012" → 12)
- Immediate, non-blocking field-level feedback

### Commit-Gate Validation (full check, blocks commit)
- **Pass-aware required fields**: evaluates each field's `defaultPassEntry` against the active workflow pass (Pass 0/1 in Phase 1). Fields beyond current pass scope do not block commit
- **ODK = S special rule**: only minimal fields required (`gameId`, `playNum`, `qtr`, `odk`). All others optional regardless of pass
- Type and enum validation on **all populated fields**, even untouched
- `playNum` uniqueness within active `gameId`
- `playNum` strict parsing (same rules as inline, enforced again at gate)
- Commit blocked with field-level inline errors if any check fails

---

## 5. IndexedDB Persistence Layer

Database: `football-engine`

| Store | Key | Purpose |
|-------|-----|---------|
| `games` | `gameId` | Game metadata (opponent, date, schema version) |
| `plays` | `gameId + playNum` | Committed play snapshots |
| `audit` | Auto-increment | Append-only ledger of all commits/overwrites |
| `schema_versions` | Version string | Schema snapshots for migration |

### Audit Record Structure
Every audit entry contains:
- `auditSeq` — Monotonically increasing per-game sequence number (ensures total ordering even at identical timestamps)
- `timestamp` — ISO 8601
- `gameId`, `playNum`
- `schemaVersion` — Schema version at time of commit
- `action` — "commit" or "overwrite"
- `fieldsChanged` — Array of changed field names
- `beforeValues` — Prior values (null for first commit)
- `afterValues` — New values
- `committedSnapshot` — Full committed row object
- `snapshotHash` — SHA-256 of canonical JSON serialization

### Canonical Snapshot Hash Computation
- Serialize the committed snapshot to JSON with **deterministic key ordering** (keys sorted alphabetically at all nesting levels)
- UTF-8 encoding, no extraneous whitespace
- No non-deterministic fields (all fields in the snapshot are stable data values)
- Compute SHA-256 of the resulting string via the Web Crypto API
- Identical snapshots across any environment produce identical hashes

---

## 6. Debug Export

- "Export Debug Snapshot" button in the UI toolbar
- Exports structured JSON file containing:
  - All committed plays for the active game
  - Complete audit log entries (with hashes and sequence numbers)
  - gameMeta record
  - Current schema version
- Optional CSV export of the plays table for spreadsheet inspection
- Clearly labeled as "Debug / Inspection Export" — not the production Hudl export

---

## 7. Transaction UI

### Game Bar (top)
- Active game display (opponent + date)
- "New Game" button → opponent + date entry
- Game switcher (clears draft state with confirmation if draft in progress)

### Draft/Proposal Panel
- Schema-driven form fields for Phase 1 scope
- Amber/yellow border indicates draft state
- Touched-field highlighting
- When `odk = S` selected, non-required fields visually de-emphasize
- Inline validation errors next to fields
- **"Clear Draft"** button — resets candidate/proposal without affecting committed data or audit
- **"Review Proposal"** button — promotes candidate to proposal
- **"Commit"** button — triggers commit-gate validation, writes to IndexedDB

### Overwrite Review Mode
- Auto-triggered on `gameId + playNum` collision at commit
- Field-by-field diff: existing vs. proposed values
- "Confirm Overwrite" / "Cancel" actions

### Committed Plays Panel
- Read-only table of committed plays for active game
- Green/stable visual treatment
- Click a row to load it into draft panel for overwrite workflow

### Status Bar
- Active game, current play number, state label (Draft / Proposal Review / Committed / Overwrite Review)
- RYG validation indicator

---

## Implementation Sequence

### Step 1: Schema & Types
- Create the JSON schema contract with version identifier
- Generate TypeScript types from the schema
- Build schema utility functions (field lookup, pass filtering, version export)

### Step 2: IndexedDB Layer
- Set up database with all four object stores (games, plays, audit, schema_versions)
- Implement CRUD operations for games and plays
- Implement append-only audit writer with auditSeq counter and canonical hash computation
- Build debug export function

### Step 3: Transaction Engine
- Implement state machine (Candidate → Proposal → Commit)
- Build two-tier validation (inline + commit-gate with pass-awareness and ODK=S rules)
- Implement playNum parsing/normalization
- Implement collision detection and overwrite review logic
- Implement draft reset (Clear Draft)

### Step 4: Game Context Manager
- Single active game state management
- New game creation flow
- Game switching with draft-clear confirmation

### Step 5: Transaction UI
- Game bar with selector and new game flow
- Draft/Proposal panel with schema-driven fields
- Overwrite review mode with diff display
- Committed plays table
- Status bar with RYG indicator
- Clear Draft button
- Debug export button

---

## What This Phase Does NOT Include
- No lookup governance (Phase 2)
- No full game initialization / slot scaffolding (Phase 3)
- No carry-forward or prediction logic (Phase 5)
- No voice input or AI (Phase 10)
- No roster or personnel (Phase 6)
- No production Hudl export (Phase 8)

