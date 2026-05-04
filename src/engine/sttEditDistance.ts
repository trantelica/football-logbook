/**
 * Bounded single-token Damerau–Levenshtein helper for Lookup Assist (Slice F2.a).
 *
 * Pure: no I/O. Single-token only — both inputs must contain no whitespace.
 * No phonetic algorithms. No multi-token fuzzy.
 */

/** Damerau–Levenshtein (optimal string alignment) distance between two whole
 *  tokens. Case-insensitive. Returns Infinity for empty inputs. */
export function tokenEditDistance(a: string, b: string): number {
  const s = (a ?? "").trim().toLowerCase();
  const t = (b ?? "").trim().toLowerCase();
  if (!s || !t) return Infinity;
  const n = s.length;
  const m = t.length;
  // 2D DP
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (
        i > 1 && j > 1 &&
        s[i - 1] === t[j - 2] &&
        s[i - 2] === t[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[n][m];
}

/**
 * Bounded check used by Lookup Assist:
 *  - both inputs must be single tokens (no whitespace), non-empty
 *  - distance ≤ 1 always allowed
 *  - distance ≤ 2 only when canonicalToken length ≥ 6
 */
export function isBoundedSttMatch(coachToken: string, canonicalToken: string): boolean {
  const a = (coachToken ?? "").trim();
  const b = (canonicalToken ?? "").trim();
  if (!a || !b) return false;
  if (/\s/.test(a) || /\s/.test(b)) return false;
  const d = tokenEditDistance(a, b);
  if (d === 0) return false; // exact handled elsewhere
  if (d === 1) return true;
  if (d === 2 && b.length >= 6) return true;
  return false;
}
