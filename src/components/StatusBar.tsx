import React, { useState } from "react";
import { useTransaction } from "@/engine/transaction";
import { useGameContext } from "@/engine/gameContext";
import { useSeason } from "@/engine/seasonContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { downloadDebugJSON, copyDebugJSON } from "@/engine/export";
import { getPlaysByGame, getCoachNotesByGame, getSeason, getAllLookups, getRosterBySeason } from "@/engine/db";
import {
  toHudlCsv,
  toNotesCsv,
  validateForExport,
  buildExportManifest,
  triggerDownload,
  HUDL_PLAYS_FILENAME,
  HUDL_NOTES_FILENAME,
  EXPORT_MANIFEST_FILENAME,
  type ExportError,
} from "@/engine/hudlExport";
import {
  buildSessionArchive,
  validateArchiveMinimum,
  SESSION_ARCHIVE_FILENAME,
  type ArchiveError,
} from "@/engine/sessionArchiveExport";
import { cn } from "@/lib/utils";
import { Download, Clipboard, FileOutput, Archive } from "lucide-react";
import { toast } from "sonner";

const STATE_LABELS: Record<string, string> = {
  idle: "No Game",
  candidate: "Draft",
  proposal: "Proposal Review",
  "overwrite-review": "Overwrite Review",
};

export function StatusBar() {
  const { activeGame } = useGameContext();
  const { activeSeason } = useSeason();
  const { state, candidate, committedPlays, inlineErrors, commitErrors } =
    useTransaction();

  const [preflightErrors, setPreflightErrors] = useState<(ExportError | ArchiveError)[]>([]);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightTitle, setPreflightTitle] = useState("Export Blocked");

  const errors = { ...inlineErrors, ...commitErrors };
  const errorCount = Object.keys(errors).length;

  // RYG indicator
  const indicator = !activeGame
    ? "bg-muted-foreground"
    : errorCount > 0
      ? "bg-destructive"
      : state === "proposal"
        ? "bg-proposal"
        : state === "candidate"
          ? "bg-candidate"
          : "bg-committed";

  const handleHudlExport = async () => {
    if (!activeGame) return;

    try {
      // 1. Fetch committed plays + notes from DB
      const [plays, allNotes] = await Promise.all([
        getPlaysByGame(activeGame.gameId),
        getCoachNotesByGame(activeGame.gameId),
      ]);

      // 2. Preflight validation
      const validation = validateForExport(plays);

      if (!validation.valid) {
        setPreflightTitle("Export Blocked");
        setPreflightErrors(validation.errors);
        setPreflightOpen(true);
        return;
      }

      // 3. Get seasonRevision
      let seasonRevision = 0;
      if (activeSeason) {
        const season = await getSeason(activeSeason.seasonId);
        seasonRevision = season?.seasonRevision ?? 0;
      }

      // 4. Filter active notes for count
      const activeNotes = allNotes.filter((n) => !n.deletedAt);

      // 5. Generate all three files
      const playsCsv = toHudlCsv(plays);
      const notesCsv = toNotesCsv(plays, allNotes);
      const manifest = buildExportManifest({
        lookupStoreVersion: "unknown",
        seasonRevision,
        playCount: plays.length,
        noteCount: activeNotes.length,
      });

      // 6. Trigger three downloads
      triggerDownload(playsCsv, HUDL_PLAYS_FILENAME, "text/csv");
      triggerDownload(notesCsv, HUDL_NOTES_FILENAME, "text/csv");
      triggerDownload(
        JSON.stringify(manifest, null, 2),
        EXPORT_MANIFEST_FILENAME,
        "application/json"
      );

      toast.success("Hudl export complete — 3 files downloaded");
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleSessionArchive = async () => {
    if (!activeGame) return;

    try {
      const seasonId = activeSeason?.seasonId ?? "";
      const [plays, notes, seasonData, lookupTables, roster] = await Promise.all([
        getPlaysByGame(activeGame.gameId),
        getCoachNotesByGame(activeGame.gameId),
        seasonId ? getSeason(seasonId) : Promise.resolve(undefined),
        seasonId ? getAllLookups(seasonId) : Promise.resolve([]),
        seasonId ? getRosterBySeason(seasonId) : Promise.resolve([]),
      ]);

      const validation = validateArchiveMinimum(plays);
      if (!validation.valid) {
        setPreflightTitle("Session Archive Blocked");
        setPreflightErrors(validation.errors);
        setPreflightOpen(true);
        return;
      }

      const findLookup = (name: string) => lookupTables.find((t) => t.fieldName === name) ?? null;

      const archive = buildSessionArchive({
        gameMeta: { gameId: activeGame.gameId, opponent: activeGame.opponent, date: activeGame.date },
        plays,
        notes,
        lookupsSnapshot: {
          offForm: findLookup("offForm"),
          offPlay: findLookup("offPlay"),
          motion: findLookup("motion"),
          roster: roster.length > 0 ? roster : null,
        },
        seasonRevision: seasonData?.seasonRevision ?? 0,
      });

      triggerDownload(
        JSON.stringify(archive, null, 2),
        SESSION_ARCHIVE_FILENAME,
        "application/json"
      );

      toast.success("Session archive downloaded");
    } catch (err) {
      toast.error(`Archive failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  return (
    <>
      <footer className="flex items-center gap-3 border-t bg-card px-4 py-1.5 text-xs text-muted-foreground">
        {/* RYG dot */}
        <div className={cn("h-2.5 w-2.5 rounded-full", indicator)} />

        {/* State */}
        <span className="font-medium">{STATE_LABELS[state] ?? state}</span>

        {activeGame && (
          <>
            <span className="text-muted-foreground/60">|</span>
            <span>vs {activeGame.opponent}</span>
            <span className="text-muted-foreground/60">|</span>
            <span>{committedPlays.length} committed</span>

            {candidate.playNum && (
              <>
                <span className="text-muted-foreground/60">|</span>
                <span>Play #{String(candidate.playNum)}</span>
              </>
            )}

            <div className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 text-xs"
                onClick={() => downloadDebugJSON(activeGame.gameId)}
              >
                <Download className="h-3 w-3" />
                JSON
              </Button>
              <CopyDebugButton gameId={activeGame.gameId} />
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 text-xs"
                onClick={handleHudlExport}
                disabled={committedPlays.length === 0}
              >
                <FileOutput className="h-3 w-3" />
                Hudl Export
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 text-xs"
                onClick={handleSessionArchive}
                disabled={committedPlays.length === 0}
              >
                <Archive className="h-3 w-3" />
                Session Archive
              </Button>
            </div>
          </>
        )}
      </footer>

      <PreflightErrorDialog
        open={preflightOpen}
        onOpenChange={setPreflightOpen}
        errors={preflightErrors}
        title={preflightTitle}
      />
    </>
  );
}

// ── Preflight Error Dialog ──

function PreflightErrorDialog({
  open,
  onOpenChange,
  errors,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  errors: (ExportError | ArchiveError)[];
  title?: string;
}) {
  // Group errors by play number
  const grouped = new Map<number | null, (ExportError | ArchiveError)[]>();
  for (const e of errors) {
    const key = e.playNumber;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm text-destructive">
            {title ?? "Export Blocked"} — {errors.length} error{errors.length !== 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-3 pr-4 text-xs">
            {Array.from(grouped.entries()).map(([playNum, errs]) => (
              <div key={playNum ?? "null"}>
                <div className="font-semibold text-foreground mb-1">
                  {playNum != null ? `Play #${playNum}` : "Unknown Play"}
                </div>
                {errs.map((e, i) => (
                  <div key={i} className="ml-3 text-muted-foreground">
                    <span className="font-medium text-foreground">{e.field}</span>
                    {" — "}
                    {e.message}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="flex justify-end pt-2">
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Copy Debug Button with clipboard fallback ──

function CopyDebugButton({ gameId }: { gameId: string }) {
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [jsonContent, setJsonContent] = useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleCopy = async () => {
    try {
      await copyDebugJSON(gameId);
      toast.success("Debug JSON copied to clipboard");
    } catch {
      try {
        const { buildDebugExport } = await import("@/engine/db");
        const data = await buildDebugExport(gameId);
        setJsonContent(JSON.stringify(data, null, 2));
        setFallbackOpen(true);
      } catch {
        toast.error("Failed to generate debug export");
      }
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 text-xs"
        onClick={handleCopy}
      >
        <Clipboard className="h-3 w-3" />
        Copy
      </Button>
      <Dialog open={fallbackOpen} onOpenChange={setFallbackOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">Debug JSON</DialogTitle>
          </DialogHeader>
          <Textarea
            ref={textareaRef}
            readOnly
            value={jsonContent}
            className="flex-1 min-h-[300px] font-mono text-[10px] leading-tight"
          />
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                textareaRef.current?.select();
              }}
            >
              Select All
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFallbackOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
