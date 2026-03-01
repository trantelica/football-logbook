/**
 * Football Engine — Debug Export Utilities
 */

import { buildDebugExport, playsToCSV, getPlaysByGame, getCoachNotesByGame } from "./db";
import type { CoachNote, PlayRecord } from "./types";

/** Download a JSON debug snapshot for the active game */
export async function downloadDebugJSON(gameId: string): Promise<void> {
  const data = await buildDebugExport(gameId);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `debug-export-${gameId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Copy debug JSON to clipboard (iPad fallback) */
export async function copyDebugJSON(gameId: string): Promise<void> {
  const data = await buildDebugExport(gameId);
  const json = JSON.stringify(data, null, 2);
  await navigator.clipboard.writeText(json);
}

/** Download a CSV of plays for the active game */
export async function downloadPlaysCSV(gameId: string): Promise<void> {
  const plays = await getPlaysByGame(gameId);
  const csv = playsToCSV(plays.sort((a, b) => a.playNum - b.playNum));
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `plays-${gameId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Notes CSV Export (derived context from committed plays) ──

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

const NOTES_CSV_COLUMNS = [
  "GAME ID", "PLAY #", "NOTE ID", "CREATED AT", "UPDATED AT", "TEXT",
  "QTR", "ODK", "YARD LN", "DN", "DIST",
  "OFF FORM", "OFF STR", "OFF PLAY", "MOTION", "RESULT", "GN/LS",
] as const;

/** Build notes CSV with derived play context */
export function notesToCSV(notes: CoachNote[], plays: PlayRecord[]): string {
  if (notes.length === 0) return "";

  const playMap = new Map<number, PlayRecord>();
  for (const p of plays) playMap.set(p.playNum, p);

  const headers = NOTES_CSV_COLUMNS.map((c) => escapeCSV(c)).join(",");
  const rows = notes.map((n) => {
    const p = playMap.get(n.playNum);
    const vals = [
      n.gameId,
      String(n.playNum),
      n.id,
      n.createdAt,
      n.updatedAt ?? "",
      n.text,
      p?.qtr != null ? String(p.qtr) : "",
      p?.odk ?? "",
      p?.yardLn != null ? String(p.yardLn) : "",
      p?.dn != null ? String(p.dn) : "",
      p?.dist != null ? String(p.dist) : "",
      p?.offForm ?? "",
      p?.offStrength ?? "",
      p?.offPlay ?? "",
      p?.motion ?? "",
      p?.result ?? "",
      p?.gainLoss != null ? String(p.gainLoss) : "",
    ];
    return vals.map((v) => escapeCSV(v)).join(",");
  });

  return [headers, ...rows].join("\n");
}

/** Download coach notes CSV for the active game */
export async function downloadNotesCSV(gameId: string): Promise<void> {
  const [allNotes, plays] = await Promise.all([
    getCoachNotesByGame(gameId),
    getPlaysByGame(gameId),
  ]);
  const activeNotes = allNotes
    .filter((n) => !n.deletedAt)
    .sort((a, b) => a.playNum - b.playNum || a.createdAt.localeCompare(b.createdAt));
  
  const csv = notesToCSV(activeNotes, plays);
  if (!csv) return;
  
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `coach-notes-${gameId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
