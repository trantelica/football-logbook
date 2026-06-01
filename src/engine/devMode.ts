/**
 * Dev-mode detection.
 *
 * Internal-only gate for developer tools and diagnostic UI. Coaches running
 * the app in normal preview or production MUST NOT see dev surfaces, so this
 * is explicit-opt-in only:
 *   - URL query string ?dev=1
 *   - localStorage flag "lovable:devMode" = "1"
 *
 * The previous behaviour of auto-enabling whenever Vite was in dev mode was
 * causing dev tools to appear in coach-facing preview sessions.
 */
export function isDevMode(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dev") === "1") return true;
  } catch {
    /* no-op */
  }
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("lovable:devMode") === "1") {
      return true;
    }
  } catch {
    /* no-op */
  }
  return false;
}
