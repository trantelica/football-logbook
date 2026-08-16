/**
 * Grid classes for the canonical slot groups.
 *
 * SLOT_GROUPS (engine/personnel) carries the semantic column count; the mapping
 * to Tailwind lives here so the engine stays free of styling concerns and both
 * Pass 2 and Pass 3 size their rows identically.
 *
 * Written as complete literal class strings because Tailwind scans source text
 * — an interpolated `grid-cols-${n}` would not survive the production build.
 */
export const SLOT_GROUP_GRID: Record<number, string> = {
  4: "grid-cols-2 sm:grid-cols-4",
  6: "grid-cols-3 sm:grid-cols-6",
};
