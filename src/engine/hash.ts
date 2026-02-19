/**
 * Football Engine — Canonical Snapshot Hash Computation
 * 
 * Deterministic JSON serialization + SHA-256 via Web Crypto API.
 * Identical snapshots across any environment produce identical hashes.
 */

/** Sort object keys alphabetically at all nesting levels */
function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/** Produce canonical JSON string: sorted keys, no whitespace */
export function canonicalJSON(obj: unknown): string {
  return JSON.stringify(sortKeys(obj));
}

/** Compute SHA-256 hash of a canonical JSON serialization */
export async function computeSnapshotHash(snapshot: unknown): Promise<string> {
  const canonical = canonicalJSON(snapshot);
  const encoded = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
