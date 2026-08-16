/**
 * Football Engine — Last Session Restore
 *
 * Remembers which season and game the coach had open, so reopening the app
 * returns them to the film they were working on instead of an empty picker.
 *
 * This is workstation state, not game data:
 *   - stored in localStorage, never in IndexedDB
 *   - never exported in a season or session archive
 *   - never audited, and it does not touch seasonRevision
 *
 * It is a pointer, not a cache. Nothing here duplicates season or game records;
 * it stores two ids and validates them against the real stores on restore. A
 * stale pointer (deleted game, game moved to another season, cleared database)
 * must degrade to "no restore" rather than resurrect anything.
 *
 * Pure functions plus localStorage access; the React wiring lives in the
 * season and game contexts.
 */

export interface LastSession {
  seasonId: string;
  /** null when a season is open but no game is selected. */
  gameId: string | null;
}

export const LAST_SESSION_STORAGE_KEY = "footballEngine.lastSession.v1";

/** Minimal shapes needed to validate a pointer — avoids importing full types. */
interface SeasonLike {
  seasonId: string;
}
interface GameLike {
  gameId: string;
  seasonId: string;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Coerce parsed JSON into a valid LastSession, or null if unusable. */
export function normalizeLastSession(raw: unknown): LastSession | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Partial<Record<keyof LastSession, unknown>>;
  if (typeof input.seasonId !== "string" || input.seasonId === "") return null;
  const gameId = typeof input.gameId === "string" && input.gameId !== "" ? input.gameId : null;
  return { seasonId: input.seasonId, gameId };
}

/** Read the stored pointer. Never throws. */
export function loadLastSession(storage?: Pick<Storage, "getItem">): LastSession | null {
  const store = storage ?? safeLocalStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(LAST_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return normalizeLastSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persist the pointer. Never throws (private browsing, quota, etc.). */
export function saveLastSession(
  session: LastSession,
  storage?: Pick<Storage, "setItem">,
): void {
  const store = storage ?? safeLocalStorage();
  if (!store) return;
  try {
    store.setItem(LAST_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* restore is a convenience; failing to persist must never break logging */
  }
}

export function clearLastSession(storage?: Pick<Storage, "removeItem">): void {
  const store = storage ?? safeLocalStorage();
  if (!store) return;
  try {
    store.removeItem(LAST_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Resolve the season to reopen, or null if the pointer is stale.
 *
 * A season deleted since last run must not block startup, so an unmatched id
 * simply yields no restore.
 */
export function resolveRestorableSeason<T extends SeasonLike>(
  seasons: readonly T[],
  session: LastSession | null,
): T | null {
  if (!session) return null;
  return seasons.find((s) => s.seasonId === session.seasonId) ?? null;
}

/**
 * Resolve the game to reopen within a season, or null.
 *
 * Requires the stored game to still exist AND still belong to the season being
 * restored. Session-archive import creates games with fresh ids, and a game
 * could in principle be rehomed, so ownership is re-checked rather than
 * assumed — reopening a game under the wrong season would show one season's
 * lookups against another's plays.
 */
export function resolveRestorableGame<T extends GameLike>(
  games: readonly T[],
  seasonId: string,
  session: LastSession | null,
): T | null {
  if (!session?.gameId) return null;
  if (session.seasonId !== seasonId) return null;
  const game = games.find((g) => g.gameId === session.gameId);
  if (!game) return null;
  return game.seasonId === seasonId ? game : null;
}
