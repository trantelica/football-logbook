/**
 * Dev-mode detection.
 * Active when Vite dev server is running OR when ?dev=1 is in the URL.
 * This allows dev tools (smoke tests, AI patch buttons) to work
 * in both the Lovable preview iframe and the production preview tab.
 */
export function isDevMode(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("dev") === "1";
  } catch {
    return false;
  }
}
