/**
 * Football Engine — IndexedDB Persistence Layer
 * 
 * Database: football-engine
 * Stores: games, plays, audit, schema_versions
 */

import { openDB, type IDBPDatabase } from "idb";
import type { PlayRecord, GameMeta, AuditRecord } from "./types";
import { SCHEMA_VERSION, exportSchemaSnapshot } from "./schema";
import { computeSnapshotHash } from "./hash";

const DB_NAME = "football-engine";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Games store
        if (!db.objectStoreNames.contains("games")) {
          db.createObjectStore("games", { keyPath: "gameId" });
        }
        // Plays store — composite key as single string "gameId:playNum"
        if (!db.objectStoreNames.contains("plays")) {
          const playStore = db.createObjectStore("plays", { keyPath: ["gameId", "playNum"] });
          playStore.createIndex("byGame", "gameId");
        }
        // Audit store — auto-increment
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
      },
    });
  }
  return dbPromise;
}

// ── Games ──

export async function createGame(meta: GameMeta): Promise<void> {
  const db = await getDB();
  await db.put("games", meta);
  // Store current schema version snapshot
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
  play: PlayRecord,
  existingPlay: PlayRecord | null
): Promise<AuditRecord> {
  const db = await getDB();
  const isOverwrite = existingPlay !== null;
  const action = isOverwrite ? "overwrite" : "commit";

  // Compute changed fields
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

  // Compute canonical hash
  const snapshotHash = await computeSnapshotHash(play);

  // Get next audit sequence
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

  // Write play + audit in a transaction
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

// ── Debug Export ──

export async function buildDebugExport(gameId: string) {
  const db = await getDB();
  const [gameMeta, plays, audit] = await Promise.all([
    db.get("games", gameId),
    getPlaysByGame(gameId),
    getAuditByGame(gameId),
  ]);

  return {
    exportType: "Debug / Inspection Export",
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    gameMeta,
    plays: plays.sort((a, b) => a.playNum - b.playNum),
    audit: audit.sort((a, b) => a.auditSeq - b.auditSeq),
  };
}

/** Convert plays to CSV string */
export function playsToCSV(plays: PlayRecord[]): string {
  if (plays.length === 0) return "";
  const headers = Object.keys(plays[0]);
  const rows = plays.map((p) =>
    headers.map((h) => {
      const val = (p as unknown as Record<string, unknown>)[h];
      return val === null || val === undefined ? "" : String(val);
    }).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}
