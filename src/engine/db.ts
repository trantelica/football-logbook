/**
 * Football Engine — IndexedDB Persistence Layer
 * 
 * Database: football-engine
 * Stores: games, plays, audit, schema_versions, seasons, lookups, lookup_audit,
 *         roster, roster_audit, game_init, slot_meta, game_audit, raw_input
 */

import { openDB, type IDBPDatabase } from "idb";
import type {
  PlayRecord, GameMeta, AuditRecord, SeasonMeta,
  LookupTable, LookupAuditRecord, RosterEntry, RosterAuditRecord,
  GameInitConfig, SlotMeta, GameAuditRecord, RawInputRecord, CoachNote,
} from "./types";
import type { SeasonConfig, ConfigAuditRecord } from "./configStore";
import { diffConfig } from "./configStore";
import { SCHEMA_VERSION, exportSchemaSnapshot, playSchema } from "./schema";
import { computeSnapshotHash } from "./hash";
import { coercePlayToSchemaTypes } from "./coerce";

const DB_NAME = "football-engine";
const DB_VERSION = 6;

/** Canonicalize a lookup value for comparison: trim + collapse spaces + lowercase */
export function canonicalizeLookupValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Normalize display value: trim + collapse spaces, preserve casing */
export function normalizeLookupDisplay(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Games store
        if (!db.objectStoreNames.contains("games")) {
          db.createObjectStore("games", { keyPath: "gameId" });
        }
        // Plays store
        if (!db.objectStoreNames.contains("plays")) {
          const playStore = db.createObjectStore("plays", { keyPath: ["gameId", "playNum"] });
          playStore.createIndex("byGame", "gameId");
        }
        // Audit store
        if (!db.objectStoreNames.contains("audit")) {
          const auditStore = db.createObjectStore("audit", {
            keyPath: "id",
            autoIncrement: true,
          });
          auditStore.createIndex("byGame", "gameId");
          auditStore.createIndex("byGamePlay", ["gameId", "playNum"]);
        }
        // Schema versions store
        if (!db.objectStoreNames.contains("schema_versions")) {
          db.createObjectStore("schema_versions", { keyPath: "version" });
        }
        // Seasons store
        if (!db.objectStoreNames.contains("seasons")) {
          db.createObjectStore("seasons", { keyPath: "seasonId" });
        }
        // Lookups store
        if (!db.objectStoreNames.contains("lookups")) {
          const lookupStore = db.createObjectStore("lookups", { keyPath: ["seasonId", "fieldName"] });
          lookupStore.createIndex("bySeason", "seasonId");
        }
        // Lookup audit store
        if (!db.objectStoreNames.contains("lookup_audit")) {
          const lookupAuditStore = db.createObjectStore("lookup_audit", {
            keyPath: "id",
            autoIncrement: true,
          });
          lookupAuditStore.createIndex("bySeason", "seasonId");
        }
        // Roster store
        if (!db.objectStoreNames.contains("roster")) {
          const rosterStore = db.createObjectStore("roster", { keyPath: ["seasonId", "jerseyNumber"] });
          rosterStore.createIndex("bySeason", "seasonId");
        }
        // Roster audit store
        if (!db.objectStoreNames.contains("roster_audit")) {
          const rosterAuditStore = db.createObjectStore("roster_audit", {
            keyPath: "id",
            autoIncrement: true,
          });
          rosterAuditStore.createIndex("bySeason", "seasonId");
        }
        // Phase 3: Game init config store
        if (!db.objectStoreNames.contains("game_init")) {
          db.createObjectStore("game_init", { keyPath: "gameId" });
        }
        // Phase 3: Slot metadata store (field commit state)
        if (!db.objectStoreNames.contains("slot_meta")) {
          const slotMetaStore = db.createObjectStore("slot_meta", { keyPath: ["gameId", "playNum"] });
          slotMetaStore.createIndex("byGame", "gameId");
        }
        // Phase 3: Game-level audit store
        if (!db.objectStoreNames.contains("game_audit")) {
          const gameAuditStore = db.createObjectStore("game_audit", {
            keyPath: "id",
            autoIncrement: true,
          });
          gameAuditStore.createIndex("byGame", "gameId");
        }
        // Phase 4: Raw input provenance store
        if (!db.objectStoreNames.contains("raw_input")) {
          const rawStore = db.createObjectStore("raw_input", { keyPath: ["gameId", "playNum"] });
          rawStore.createIndex("byGame", "gameId");
        }
        // Phase 7.2: Coach notes store
        if (!db.objectStoreNames.contains("coach_notes")) {
          const notesStore = db.createObjectStore("coach_notes", { keyPath: "id" });
          notesStore.createIndex("byGame", "gameId");
          notesStore.createIndex("byGamePlay", ["gameId", "playNum"]);
        }
        // Phase 9.1: Config store
        if (!db.objectStoreNames.contains("config")) {
          db.createObjectStore("config", { keyPath: "seasonId" });
        }
        // Phase 9.1: Config audit store
        if (!db.objectStoreNames.contains("config_audit")) {
          const configAuditStore = db.createObjectStore("config_audit", {
            keyPath: "id",
            autoIncrement: true,
          });
          configAuditStore.createIndex("bySeason", "seasonId");
        }
      },
    });
  }
  return dbPromise;
}

// ── Seasons ──

export async function createSeason(meta: SeasonMeta): Promise<void> {
  const db = await getDB();
  await db.put("seasons", meta);
}

export async function getAllSeasons(): Promise<SeasonMeta[]> {
  const db = await getDB();
  return db.getAll("seasons");
}

export async function getSeason(seasonId: string): Promise<SeasonMeta | undefined> {
  const db = await getDB();
  return db.get("seasons", seasonId);
}

export async function incrementSeasonRevision(seasonId: string): Promise<number> {
  const db = await getDB();
  const season = await db.get("seasons", seasonId) as SeasonMeta | undefined;
  if (!season) throw new Error(`Season ${seasonId} not found`);
  season.seasonRevision += 1;
  await db.put("seasons", season);
  return season.seasonRevision;
}

// ── Lookups ──

export async function getLookupTable(seasonId: string, fieldName: string): Promise<LookupTable | undefined> {
  const db = await getDB();
  return db.get("lookups", [seasonId, fieldName]);
}

export async function getAllLookups(seasonId: string): Promise<LookupTable[]> {
  const db = await getDB();
  return db.getAllFromIndex("lookups", "bySeason", seasonId);
}

export async function initDefaultLookups(seasonId: string, lookupFields: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("lookups", "readwrite");
  for (const fieldName of lookupFields) {
    const existing = await tx.store.get([seasonId, fieldName]);
    if (!existing) {
      await tx.store.put({
        seasonId,
        fieldName,
        values: [],
        updatedAt: new Date().toISOString(),
      } satisfies LookupTable);
    }
  }
  await tx.done;
}

export async function addLookupValue(
  seasonId: string,
  fieldName: string,
  rawValue: string,
  attributes?: Record<string, string>
): Promise<void> {
  const value = canonicalizeLookupValue(rawValue);
  if (!value) throw new Error("Value cannot be empty");

  const db = await getDB();
  const table = await db.get("lookups", [seasonId, fieldName]) as LookupTable | undefined;
  if (!table) throw new Error(`Lookup table not found: ${fieldName}`);

  const displayValue = normalizeLookupDisplay(rawValue);
  const canonicalKey = canonicalizeLookupValue(rawValue);

  if (table.values.some((v) => canonicalizeLookupValue(v) === canonicalKey)) {
    throw new Error(`"${displayValue}" already exists in ${fieldName}`);
  }

  const newRevision = await incrementSeasonRevision(seasonId);

  table.values.push(displayValue);
  table.updatedAt = new Date().toISOString();

  // Store dependent attributes if provided
  if (attributes && Object.keys(attributes).length > 0) {
    if (!table.entryAttributes) table.entryAttributes = {};
    table.entryAttributes[canonicalKey] = attributes;
  }

  await db.put("lookups", table);

  const auditRecord: Omit<LookupAuditRecord, "id"> = {
    seasonId,
    fieldName,
    action: "add",
    value: displayValue,
    seasonRevision: newRevision,
    timestamp: new Date().toISOString(),
  };
  await db.add("lookup_audit", auditRecord);
}

export async function removeLookupValue(seasonId: string, fieldName: string, rawValue: string): Promise<void> {
  const value = canonicalizeLookupValue(rawValue);
  const db = await getDB();

  // Safety check: query plays in this season that use this value
  const games = (await db.getAll("games") as GameMeta[]).filter((g) => g.seasonId === seasonId);
  for (const game of games) {
    const plays = await db.getAllFromIndex("plays", "byGame", game.gameId) as PlayRecord[];
    const used = plays.some((p) => {
      const fieldVal = (p as unknown as Record<string, unknown>)[fieldName];
      return fieldVal !== null && fieldVal !== undefined && canonicalizeLookupValue(String(fieldVal)) === value;
    });
    if (used) {
      throw new Error("Value used in committed plays. Removal blocked.");
    }
  }

  const table = await db.get("lookups", [seasonId, fieldName]) as LookupTable | undefined;
  if (!table) throw new Error(`Lookup table not found: ${fieldName}`);

  table.values = table.values.filter((v) => canonicalizeLookupValue(v) !== value);
  table.updatedAt = new Date().toISOString();

  const newRevision = await incrementSeasonRevision(seasonId);

  await db.put("lookups", table);

  const auditRecord: Omit<LookupAuditRecord, "id"> = {
    seasonId,
    fieldName,
    action: "remove",
    value,
    seasonRevision: newRevision,
    timestamp: new Date().toISOString(),
  };
  await db.add("lookup_audit", auditRecord);
}

// ── Roster ──

export async function getRosterBySeason(seasonId: string): Promise<RosterEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("roster", "bySeason", seasonId);
}

export async function getRosterEntry(seasonId: string, jerseyNumber: number): Promise<RosterEntry | undefined> {
  const db = await getDB();
  return db.get("roster", [seasonId, jerseyNumber]);
}

export async function addRosterEntry(seasonId: string, jerseyNumber: number, playerName: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get("roster", [seasonId, jerseyNumber]);
  if (existing) throw new Error(`Jersey #${jerseyNumber} already exists in roster`);

  const newRevision = await incrementSeasonRevision(seasonId);

  await db.put("roster", { seasonId, jerseyNumber, playerName } satisfies RosterEntry);

  const auditRecord: Omit<RosterAuditRecord, "id"> = {
    seasonId,
    jerseyNumber,
    playerName,
    action: "add",
    seasonRevision: newRevision,
    timestamp: new Date().toISOString(),
  };
  await db.add("roster_audit", auditRecord);
}

export async function removeRosterEntry(seasonId: string, jerseyNumber: number): Promise<void> {
  const db = await getDB();
  const entry = await db.get("roster", [seasonId, jerseyNumber]) as RosterEntry | undefined;
  if (!entry) return;

  const newRevision = await incrementSeasonRevision(seasonId);

  await db.delete("roster", [seasonId, jerseyNumber]);

  const auditRecord: Omit<RosterAuditRecord, "id"> = {
    seasonId,
    jerseyNumber,
    playerName: entry.playerName,
    action: "remove",
    seasonRevision: newRevision,
    timestamp: new Date().toISOString(),
  };
  await db.add("roster_audit", auditRecord);
}

export async function updateRosterEntry(seasonId: string, jerseyNumber: number, playerName: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get("roster", [seasonId, jerseyNumber]) as RosterEntry | undefined;
  if (!existing) throw new Error(`Jersey #${jerseyNumber} not found in roster`);

  const newRevision = await incrementSeasonRevision(seasonId);

  await db.put("roster", { seasonId, jerseyNumber, playerName } satisfies RosterEntry);

  const auditRecord: Omit<RosterAuditRecord, "id"> = {
    seasonId,
    jerseyNumber,
    playerName,
    action: "update",
    seasonRevision: newRevision,
    timestamp: new Date().toISOString(),
  };
  await db.add("roster_audit", auditRecord);
}

// ── Games ──

export async function createGame(meta: GameMeta): Promise<void> {
  const db = await getDB();
  await db.put("games", meta);
  await db.put("schema_versions", exportSchemaSnapshot());
}

export async function getAllGames(): Promise<GameMeta[]> {
  const db = await getDB();
  return db.getAll("games");
}

export async function getGame(gameId: string): Promise<GameMeta | undefined> {
  const db = await getDB();
  return db.get("games", gameId);
}

// ── Plays ──

export async function getPlay(
  gameId: string,
  playNum: number
): Promise<PlayRecord | undefined> {
  const db = await getDB();
  return db.get("plays", [gameId, playNum]);
}

export async function getPlaysByGame(gameId: string): Promise<PlayRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex("plays", "byGame", gameId);
}

/** Get the next auditSeq for a game */
async function getNextAuditSeq(
  db: IDBPDatabase,
  gameId: string
): Promise<number> {
  const allAudits: AuditRecord[] = await db.getAllFromIndex(
    "audit",
    "byGame",
    gameId
  );
  if (allAudits.length === 0) return 1;
  return Math.max(...allAudits.map((a) => a.auditSeq)) + 1;
}

/** Commit a play to IndexedDB with full audit trail */
export async function commitPlay(
  rawPlay: PlayRecord,
  existingPlay: PlayRecord | null
): Promise<AuditRecord> {
  // Defense-in-depth: coerce integer fields to numbers before persistence
  const play = coercePlayToSchemaTypes(rawPlay);
  const db = await getDB();
  const isOverwrite = existingPlay !== null;
  const action = isOverwrite ? "overwrite" : "commit";

  const allFields = Object.keys(play) as (keyof PlayRecord)[];
  const fieldsChanged: string[] = [];
  const beforeValues: Record<string, unknown> = {};
  const afterValues: Record<string, unknown> = {};

  for (const field of allFields) {
    if (field === "gameId") continue;
    const newVal = play[field];
    const oldVal = existingPlay ? existingPlay[field] : undefined;
    if (newVal !== oldVal) {
      fieldsChanged.push(field);
      beforeValues[field] = oldVal ?? null;
      afterValues[field] = newVal;
    }
  }

  const snapshotHash = await computeSnapshotHash(play);
  const auditSeq = await getNextAuditSeq(db, play.gameId);

  const auditRecord: Omit<AuditRecord, "id"> = {
    auditSeq,
    timestamp: new Date().toISOString(),
    gameId: play.gameId,
    playNum: play.playNum,
    schemaVersion: SCHEMA_VERSION,
    action,
    fieldsChanged,
    beforeValues: isOverwrite ? beforeValues : null,
    afterValues,
    committedSnapshot: { ...play },
    snapshotHash,
  };

  const tx = db.transaction(["plays", "audit"], "readwrite");
  await tx.objectStore("plays").put(play);
  await tx.objectStore("audit").add(auditRecord);
  await tx.done;

  return auditRecord as AuditRecord;
}

// ── Audit ──

export async function getAuditByGame(gameId: string): Promise<AuditRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex("audit", "byGame", gameId);
}

// ── Phase 3: Game Init ──

export async function saveGameInit(config: GameInitConfig): Promise<void> {
  const db = await getDB();
  await db.put("game_init", config);
}

export async function getGameInit(gameId: string): Promise<GameInitConfig | undefined> {
  const db = await getDB();
  return db.get("game_init", gameId);
}

// ── Phase 3: Slot Meta ──

export async function saveSlotMeta(meta: SlotMeta): Promise<void> {
  const db = await getDB();
  await db.put("slot_meta", meta);
}

export async function getSlotMeta(gameId: string, playNum: number): Promise<SlotMeta | undefined> {
  const db = await getDB();
  return db.get("slot_meta", [gameId, playNum]);
}

export async function getAllSlotMetaForGame(gameId: string): Promise<SlotMeta[]> {
  const db = await getDB();
  return db.getAllFromIndex("slot_meta", "byGame", gameId);
}

/** Batch-save slots and their metadata in a single transaction */
export async function putSlotsBatch(
  slots: PlayRecord[],
  slotMetas: SlotMeta[]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["plays", "slot_meta"], "readwrite");
  const playStore = tx.objectStore("plays");
  const metaStore = tx.objectStore("slot_meta");

  for (const slot of slots) {
    await playStore.put(slot);
  }
  for (const meta of slotMetas) {
    await metaStore.put(meta);
  }

  await tx.done;
}

// ── Phase 3: Game Audit ──

export async function addGameAudit(record: Omit<GameAuditRecord, "id">): Promise<void> {
  const db = await getDB();
  await db.add("game_audit", record);
}

export async function getGameAudits(gameId: string): Promise<GameAuditRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex("game_audit", "byGame", gameId);
}

// ── Phase 4: Raw Input ──

export async function saveRawInput(record: RawInputRecord): Promise<void> {
  const db = await getDB();
  await db.put("raw_input", record);
}

export async function getRawInput(gameId: string, playNum: number): Promise<RawInputRecord | undefined> {
  const db = await getDB();
  return db.get("raw_input", [gameId, playNum]);
}

export async function getRawInputsByGame(gameId: string): Promise<RawInputRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex("raw_input", "byGame", gameId);
}

// ── Phase 7.2: Coach Notes ──

export async function createCoachNote(note: CoachNote): Promise<void> {
  const db = await getDB();
  await db.put("coach_notes", note);
}

export async function updateCoachNote(id: string, patch: { text: string }): Promise<void> {
  const db = await getDB();
  const note = await db.get("coach_notes", id) as CoachNote | undefined;
  if (!note) throw new Error(`Note ${id} not found`);
  note.text = patch.text;
  note.updatedAt = new Date().toISOString();
  await db.put("coach_notes", note);
}

export async function softDeleteCoachNote(id: string): Promise<void> {
  const db = await getDB();
  const note = await db.get("coach_notes", id) as CoachNote | undefined;
  if (!note) throw new Error(`Note ${id} not found`);
  note.deletedAt = new Date().toISOString();
  note.updatedAt = new Date().toISOString();
  await db.put("coach_notes", note);
}

export async function getCoachNotesByGame(gameId: string): Promise<CoachNote[]> {
  const db = await getDB();
  return db.getAllFromIndex("coach_notes", "byGame", gameId);
}

export async function getCoachNotesByGameAndPlay(gameId: string, playNum: number): Promise<CoachNote[]> {
  const db = await getDB();
  return db.getAllFromIndex("coach_notes", "byGamePlay", [gameId, playNum]);
}

// ── Phase 9.1: Season Config ──

export async function getSeasonConfig(seasonId: string): Promise<SeasonConfig | undefined> {
  const db = await getDB();
  return db.get("config", seasonId);
}

export async function saveSeasonConfig(after: SeasonConfig, before: SeasonConfig | null): Promise<void> {
  const changes = before ? diffConfig(before, after) : [{ key: "_init", before: null, after: "created" }];
  if (before && changes.length === 0) return; // no-op

  const db = await getDB();
  const tx = db.transaction(["config", "config_audit"], "readwrite");

  const saved: SeasonConfig = {
    ...after,
    version: before ? before.version + 1 : after.version,
    updatedAt: new Date().toISOString(),
    updatedBy: "local",
  };
  await tx.objectStore("config").put(saved);

  const auditRecord: Omit<ConfigAuditRecord, "id"> = {
    seasonId: after.seasonId,
    eventId: crypto.randomUUID(),
    at: new Date().toISOString(),
    type: "CONFIG_CHANGE",
    versionBefore: before?.version ?? 0,
    versionAfter: saved.version,
    changes,
  };
  await tx.objectStore("config_audit").add(auditRecord);
  await tx.done;
}

export async function getConfigAuditBySeason(seasonId: string): Promise<ConfigAuditRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex("config_audit", "bySeason", seasonId);
}

/**
 * Count committed plays for a season.
 * The plays store ONLY contains committed rows — drafts/proposals live in React state.
 */
export async function countSeasonCommittedPlays(seasonId: string): Promise<number> {
  const db = await getDB();
  const allGames = await db.getAll("games") as GameMeta[];
  const seasonGames = allGames.filter((g) => g.seasonId === seasonId);
  let total = 0;
  for (const game of seasonGames) {
    const count = await db.countFromIndex("plays", "byGame", game.gameId);
    total += count;
  }
  return total;
}

// ── Phase 8.3: Lookup/Roster Replace (all-or-nothing) ──

/**
 * Replace lookup tables for a season atomically.
 * Deletes existing tables for the given fieldNames, then writes the new ones.
 */
export async function replaceLookups(
  seasonId: string,
  tables: Array<LookupTable | null>,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("lookups", "readwrite");
  const store = tx.objectStore("lookups");

  // Delete existing for the three canonical fields
  for (const fieldName of ["offForm", "offPlay", "motion"]) {
    try { await store.delete([seasonId, fieldName]); } catch { /* ignore if missing */ }
  }

  // Write new tables (skip nulls)
  for (const table of tables) {
    if (!table) continue;
    await store.put({ ...table, seasonId, updatedAt: new Date().toISOString() });
  }

  await tx.done;
}

/**
 * Replace roster for a season atomically.
 * Deletes all existing entries, then writes the new ones.
 */
export async function replaceRosterBySeason(
  seasonId: string,
  roster: RosterEntry[],
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("roster", "readwrite");
  const store = tx.objectStore("roster");

  // Delete all existing for this season
  const existing = await store.index("bySeason").getAllKeys(seasonId);
  for (const key of existing) {
    await store.delete(key);
  }

  // Write new entries
  for (const entry of roster) {
    await store.put({ ...entry, seasonId });
  }

  await tx.done;
}

/**
 * Bump season revision by 1. Returns the new revision number.
 */
export async function bumpSeasonRevision(seasonId: string): Promise<number> {
  return incrementSeasonRevision(seasonId);
}

/**
 * Atomic import: replace lookups + roster + bump seasonRevision in ONE IDB transaction.
 * If any step fails the entire transaction aborts — nothing persists.
 */
export async function importLookupsReplaceOnly(
  seasonId: string,
  lookups: { offForm: LookupTable | null; offPlay: LookupTable | null; motion: LookupTable | null },
  roster: RosterEntry[] | null,
): Promise<number> {
  const db = await getDB();
  const tx = db.transaction(["lookups", "roster", "seasons"], "readwrite");

  const lookupStore = tx.objectStore("lookups");
  const rosterStore = tx.objectStore("roster");
  const seasonStore = tx.objectStore("seasons");

  // a) Delete existing offForm/offPlay/motion for seasonId
  for (const fieldName of ["offForm", "offPlay", "motion"] as const) {
    try { await lookupStore.delete([seasonId, fieldName]); } catch { /* ignore */ }
  }

  // b) Write new lookup tables (skip nulls)
  const now = new Date().toISOString();
  for (const table of [lookups.offForm, lookups.offPlay, lookups.motion]) {
    if (!table) continue;
    await lookupStore.put({ ...table, seasonId, updatedAt: now });
  }

  // c) Delete all roster entries for seasonId
  const existingRosterKeys = await rosterStore.index("bySeason").getAllKeys(seasonId);
  for (const key of existingRosterKeys) {
    await rosterStore.delete(key);
  }

  // d) Write new roster entries
  if (roster) {
    for (const entry of roster) {
      await rosterStore.put({ ...entry, seasonId });
    }
  }

  // e) Increment seasonRevision by 1
  const season = await seasonStore.get(seasonId) as SeasonMeta | undefined;
  if (!season) {
    tx.abort();
    throw new Error(`Season ${seasonId} not found`);
  }
  season.seasonRevision += 1;
  await seasonStore.put(season);

  await tx.done;
  return season.seasonRevision;
}

// ── Phase 8.4: Season Package helpers ──

export async function getGamesBySeason(seasonId: string): Promise<GameMeta[]> {
  const db = await getDB();
  const all = await db.getAll("games") as GameMeta[];
  return all.filter((g) => g.seasonId === seasonId);
}

/**
 * Gather all data for a season and build a SeasonPackage (pure export).
 */
export async function buildSeasonPackageExport(seasonId: string): Promise<import("./seasonTransfer").SeasonPackage> {
  const { buildSeasonPackage } = await import("./seasonTransfer");

  const db = await getDB();
  const [seasonData, lookupTables, roster, games] = await Promise.all([
    db.get("seasons", seasonId) as Promise<SeasonMeta | undefined>,
    getAllLookups(seasonId),
    getRosterBySeason(seasonId),
    getGamesBySeason(seasonId),
  ]);

  if (!seasonData) throw new Error(`Season ${seasonId} not found`);

  // Fetch plays and notes per game in parallel
  const gameIds = games.map((g) => g.gameId);
  const [playsArrays, notesArrays] = await Promise.all([
    Promise.all(gameIds.map((id) => getPlaysByGame(id))),
    Promise.all(gameIds.map((id) => getCoachNotesByGame(id))),
  ]);

  const playsByGame: Record<string, PlayRecord[]> = {};
  const notesByGame: Record<string, CoachNote[]> = {};
  for (let i = 0; i < gameIds.length; i++) {
    playsByGame[gameIds[i]] = playsArrays[i];
    notesByGame[gameIds[i]] = notesArrays[i];
  }

  // Fetch season config if available
  const configData = await getSeasonConfig(seasonId);

  const pkg = buildSeasonPackage({
    season: seasonData,
    lookupTables,
    roster: roster.length > 0 ? roster : null,
    games,
    playsByGame,
    notesByGame,
  });

  // Attach config if present
  if (configData) {
    pkg.config = configData;
  }

  return pkg;
}

/**
 * Import a normalized season package as a NEW season.
 * Remaps all IDs. Single IDB transaction across all stores.
 */
export async function importSeasonPackageNewSeason(
  pkg: import("./seasonTransfer").NormalizedSeasonPackage,
): Promise<{ newSeasonId: string; newGameIds: string[] }> {
  const newSeasonId = crypto.randomUUID();
  const gameIdMap = new Map<string, string>();
  const newGameIds: string[] = [];
  for (const g of pkg.games) {
    const newId = crypto.randomUUID();
    gameIdMap.set(g.gameId, newId);
    newGameIds.push(newId);
  }

  const db = await getDB();
  const tx = db.transaction(
    ["seasons", "lookups", "roster", "games", "plays", "coach_notes", "config"],
    "readwrite",
  );

  const now = new Date().toISOString();

  // 1) Season meta
  const newSeason: SeasonMeta = {
    seasonId: newSeasonId,
    label: pkg.season.label + " (Imported)",
    createdAt: now,
    seasonRevision: 0,
  };
  await tx.objectStore("seasons").put(newSeason);

  // 2) Lookups — force fieldName from key, deep-clone entryAttributes
  const lookupStore = tx.objectStore("lookups");
  for (const [key, table] of Object.entries(pkg.lookups)) {
    if (!table) continue;
    await lookupStore.put({
      seasonId: newSeasonId,
      fieldName: key,
      values: [...(table.values ?? [])],
      updatedAt: table.updatedAt || now,
      ...(table.entryAttributes
        ? { entryAttributes: JSON.parse(JSON.stringify(table.entryAttributes)) }
        : {}),
    });
  }

  // 3) Roster
  if (pkg.roster) {
    const rosterStore = tx.objectStore("roster");
    for (const entry of pkg.roster) {
      await rosterStore.put({ ...entry, seasonId: newSeasonId });
    }
  }

  // 4) Games
  const gameStore = tx.objectStore("games");
  for (const g of pkg.games) {
    const newGameId = gameIdMap.get(g.gameId)!;
    await gameStore.put({ ...g, gameId: newGameId, seasonId: newSeasonId });
  }

  // 5) Plays (remapped gameId)
  const playStore = tx.objectStore("plays");
  for (const [oldGameId, plays] of Object.entries(pkg.playsByGame)) {
    const newGameId = gameIdMap.get(oldGameId);
    if (!newGameId) continue;
    for (const p of plays) {
      await playStore.put({ ...p, gameId: newGameId });
    }
  }

  // 6) Notes (remapped gameId, new note id)
  const noteStore = tx.objectStore("coach_notes");
  for (const [oldGameId, notes] of Object.entries(pkg.notesByGame)) {
    const newGameId = gameIdMap.get(oldGameId);
    if (!newGameId) continue;
    for (const n of notes) {
      await noteStore.put({ ...n, id: crypto.randomUUID(), gameId: newGameId });
    }
  }

  // 7) Config (optional)
  if (pkg.config) {
    await tx.objectStore("config").put({ ...pkg.config, seasonId: newSeasonId });
  }

  await tx.done;
  return { newSeasonId, newGameIds };
}

// ── Debug Export ──

export async function buildDebugExport(gameId: string) {
  const db = await getDB();
  const [gameMeta, plays, audit, gameInit, slotMetas, gameAudits] = await Promise.all([
    db.get("games", gameId) as Promise<GameMeta | undefined>,
    getPlaysByGame(gameId),
    getAuditByGame(gameId),
    getGameInit(gameId),
    getAllSlotMetaForGame(gameId),
    getGameAudits(gameId),
  ]);

  // Include season data if game has a seasonId
  let seasonData = {};
  if (gameMeta?.seasonId) {
    const sid = gameMeta.seasonId;
    const [season, lookups, lookupAudit, roster, rosterAudit, config, configAudit] = await Promise.all([
      db.get("seasons", sid),
      getAllLookups(sid),
      db.getAllFromIndex("lookup_audit", "bySeason", sid) as Promise<LookupAuditRecord[]>,
      getRosterBySeason(sid),
      db.getAllFromIndex("roster_audit", "bySeason", sid) as Promise<RosterAuditRecord[]>,
      getSeasonConfig(sid),
      getConfigAuditBySeason(sid),
    ]);
    seasonData = {
      season,
      lookups,
      lookupAudit: lookupAudit.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
      roster: roster.sort((a, b) => a.jerseyNumber - b.jerseyNumber),
      rosterAudit: rosterAudit.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
      config: config ?? null,
      configAudit: configAudit.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
    };
  }

  // Include raw input provenance
  const rawInputs = await getRawInputsByGame(gameId);

  // Include coach notes (all, including soft-deleted)
  const allNotes = await getCoachNotesByGame(gameId);

  return {
    exportType: "Debug / Inspection Export",
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    dbVersion: DB_VERSION,
    gameMeta,
    gameInit: gameInit ?? null,
    plays: plays.sort((a, b) => a.playNum - b.playNum),
    slotMeta: slotMetas.sort((a, b) => a.playNum - b.playNum),
    audit: audit.sort((a, b) => a.auditSeq - b.auditSeq),
    gameAudit: gameAudits.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
    rawInputs: rawInputs.sort((a, b) => a.playNum - b.playNum),
    notes: allNotes.sort((a, b) => a.playNum - b.playNum || a.createdAt.localeCompare(b.createdAt)),
    notesActive: allNotes.filter((n) => !n.deletedAt).sort((a, b) => a.playNum - b.playNum || a.createdAt.localeCompare(b.createdAt)),
    ...seasonData,
  };
}

// ── CSV Export (Hudl-ready) ──

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** Convert plays to Hudl-ready CSV with PDR Output Labels and stable column order */
export function playsToCSV(plays: PlayRecord[]): string {
  if (plays.length === 0) return "";

  const columns = playSchema.map((f) => ({
    key: f.name,
    label: f.outputLabel ?? f.label,
  }));

  const headers = columns.map((c) => escapeCSV(c.label));
  const rows = plays.map((p) =>
    columns.map((c) => {
      const val = (p as unknown as Record<string, unknown>)[c.key];
      if (val === null || val === undefined) return "";
      return escapeCSV(String(val));
    }).join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}
