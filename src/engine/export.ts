/**
 * Football Engine — Debug Export Utilities
 */

import { buildDebugExport, playsToCSV, getPlaysByGame } from "./db";

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
