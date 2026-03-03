/**
 * Football Engine — Filename Helpers
 *
 * Pure utility functions for generating human-readable, collision-resistant export filenames.
 */

/** Slugify a label: lowercase, trim, replace spaces with hyphens, remove non-alphanumeric */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/** Date stamp in YYYY-MM-DD format (local time) */
export function dateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
