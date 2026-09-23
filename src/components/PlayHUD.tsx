/**
 * PlayHUD — the persistent orientation strip.
 *
 * Replaces the label/value chip strip with something readable at a glance. The
 * coach's eyes are on the film; when they come up it is for about a second, and
 * in that second they need three things:
 *
 *   1. which play am I on
 *   2. what is the situation
 *   3. what state is it in — draft, proposed, blocked, or committed
 *
 * So the situation is rendered the way a coach already reads it ("2nd & 7"),
 * not as separate DN / DIST fields, and transaction state gets one unambiguous
 * colour rather than being inferred from panel styling.
 *
 * Pure display. No mutations, no proposal or commit logic.
 */

import { isPass1Complete } from "@/engine/personnel";
import { useTransaction } from "@/engine/transaction";
import { cn } from "@/lib/utils";

const DOWN_LABELS: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };

/** Quarter 5 is overtime and must not render as "Q5". */
function formatQuarter(qtr: unknown): string {
  const n = Number(qtr);
  if (n === 5) return "OT";
  return Number.isFinite(n) ? `Q${n}` : `Q${String(qtr)}`;
}

const ODK_LABELS: Record<string, string> = {
  O: "Offense",
  D: "Defense",
  K: "Kicking",
  S: "Special",
};

type HudState = "committed" | "blocked" | "proposal" | "draft";

const STATE_STYLES: Record<HudState, { label: string; dot: string; text: string }> = {
  committed: { label: "Committed", dot: "bg-committed", text: "text-committed" },
  blocked: { label: "Needs fixes", dot: "bg-warning", text: "text-warning" },
  proposal: { label: "Proposed", dot: "bg-proposal", text: "text-proposal" },
  draft: { label: "Draft", dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

function has(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "";
}

/**
 * Render down and distance the way it is spoken.
 * Falls back to a placeholder until both halves exist — a half-formed
 * "2nd & —" reads as data loss rather than as an empty field.
 */
function formatDownDistance(dn: unknown, dist: unknown): string | null {
  if (!has(dn) || !has(dist)) return null;
  const down = DOWN_LABELS[Number(dn)] ?? String(dn);
  return `${down} & ${dist}`;
}

export function PlayHUD() {
  const {
    candidate,
    activePass,
    state,
    commitErrors,
    selectedSlotNum,
    slotMetaMap,
    committedPlays,
  } = useTransaction();
  const c = candidate as Record<string, unknown>;

  const errorCount = Object.keys(commitErrors ?? {}).length;
  const meta = selectedSlotNum !== null ? slotMetaMap.get(selectedSlotNum) : undefined;

  // Not `committedFields.length > 0` — scaffolding pre-commits qtr/odk/series,
  // so that reads as "Committed" on an untouched slot. isPass1Complete requires
  // a result and gain/loss, which only a real commit produces.
  const selectedPlay =
    selectedSlotNum !== null
      ? committedPlays.find((p) => p.playNum === selectedSlotNum)
      : undefined;
  const isCommitted = !!selectedPlay && isPass1Complete(selectedPlay, meta);

  // Blocking beats every other state: an unresolved error is the one thing
  // worth interrupting the film for.
  const hudState: HudState =
    errorCount > 0
      ? "blocked"
      : state === "proposal" || state === "overwrite-review"
        ? "proposal"
        : isCommitted
          ? "committed"
          : "draft";

  const style = STATE_STYLES[hudState];
  const downDistance = formatDownDistance(c.dn, c.dist);
  const odk = has(c.odk) ? String(c.odk) : null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b bg-card px-4 py-2.5"
      aria-label="Current play context"
    >
      {/* Play number — the primary anchor, largest thing in the strip */}
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Play
        </span>
        <span className="text-2xl font-bold leading-none tabular-nums text-foreground">
          {has(c.playNum) ? String(c.playNum) : "—"}
        </span>
      </div>

      <span className="h-6 w-px bg-border" aria-hidden />

      {/* Situation, in coach language */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {has(c.qtr) && (
          <span className="text-sm font-medium text-muted-foreground">
            {formatQuarter(c.qtr)}
          </span>
        )}

        {downDistance ? (
          <span className="text-lg font-semibold leading-none tabular-nums text-foreground">
            {downDistance}
          </span>
        ) : (
          <span className="text-lg font-semibold leading-none text-muted-foreground/40">
            &mdash; &amp; &mdash;
          </span>
        )}

        {has(c.yardLn) && (
          <span className="text-sm tabular-nums text-muted-foreground">
            ball <span className="font-medium text-foreground">{String(c.yardLn)}</span>
          </span>
        )}

        {has(c.hash) && (
          <span className="text-sm text-muted-foreground">
            hash <span className="font-medium text-foreground">{String(c.hash)}</span>
          </span>
        )}
      </div>

      {/* Called play — only once it exists, so the strip stays quiet early */}
      {(has(c.offForm) || has(c.offPlay)) && (
        <>
          <span className="h-6 w-px bg-border" aria-hidden />
          <div className="flex items-baseline gap-2 text-sm">
            {has(c.offForm) && <span className="font-medium">{String(c.offForm)}</span>}
            {has(c.offPlay) && (
              <span className="text-muted-foreground">{String(c.offPlay)}</span>
            )}
          </div>
        </>
      )}

      {/* State + pass, right-aligned so the eye always finds them in one place */}
      <div className="ml-auto flex items-center gap-4">
        {odk && odk !== "O" && (
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {ODK_LABELS[odk] ?? odk}
          </span>
        )}

        <div className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", style.dot)} aria-hidden />
          <span className={cn("text-xs font-semibold", style.text)}>
            {hudState === "blocked" && errorCount > 0
              ? `${errorCount} ${errorCount === 1 ? "fix" : "fixes"} needed`
              : style.label}
          </span>
        </div>

        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pass {activePass}
        </span>
      </div>
    </div>
  );
}
