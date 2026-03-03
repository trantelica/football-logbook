/**
 * Coach Notes Panel — collapsible section for per-play notes.
 * Independent of transaction/proposal state. Never mutates play data.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useGameContext } from "@/engine/gameContext";
import {
  createCoachNote,
  updateCoachNote,
  softDeleteCoachNote,
  getCoachNotesByGameAndPlay,
} from "@/engine/db";
import type { CoachNote } from "@/engine/types";
import { cn } from "@/lib/utils";
import { MessageSquare, ChevronDown, Save, X, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";


interface CoachNotesPanelProps {
  selectedSlotNum: number | null;
}

export function CoachNotesPanel({ selectedSlotNum }: CoachNotesPanelProps) {
  const { activeGame } = useGameContext();
  const gameId = activeGame?.gameId ?? "";

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [draftText, setDraftText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const refreshNotes = useCallback(async () => {
    if (!gameId || selectedSlotNum === null) {
      setNotes([]);
      return;
    }
    const all = await getCoachNotesByGameAndPlay(gameId, selectedSlotNum);
    setNotes(
      all
        .filter((n) => !n.deletedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }, [gameId, selectedSlotNum]);

  useEffect(() => {
    refreshNotes();
    setDraftText("");
    setEditingId(null);
  }, [refreshNotes]);

  const handleSave = async () => {
    const text = draftText.trim();
    if (!text || !gameId || selectedSlotNum === null) return;

    const note: CoachNote = {
      id: crypto.randomUUID(),
      gameId,
      playNum: selectedSlotNum,
      text,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      deletedAt: null,
    };
    await createCoachNote(note);
    setDraftText("");
    await refreshNotes();
    toast.success("Note saved");
  };

  const handleEditSave = async () => {
    if (!editingId || !editText.trim()) return;
    await updateCoachNote(editingId, { text: editText.trim() });
    setEditingId(null);
    setEditText("");
    await refreshNotes();
    toast.success("Note updated");
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await softDeleteCoachNote(deleteId);
    setDeleteId(null);
    await refreshNotes();
    toast.success("Note deleted");
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-3">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 mb-1">
          <MessageSquare className="h-3.5 w-3.5" />
          Coach Notes
          {notes.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/10 text-primary text-[10px] font-semibold px-1.5">
              {notes.length}
            </span>
          )}
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-lg border border-border/50 p-3 space-y-3 bg-muted/30">
          {selectedSlotNum === null ? (
            <p className="text-xs text-muted-foreground italic">
              Select a play slot to add a note.
            </p>
          ) : (
            <>
              {/* Quick entry */}
              <div className="space-y-2">
                <Textarea
                  className="text-xs h-16 resize-none"
                  placeholder="Add a note for this play…"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={handleSave}
                    disabled={!draftText.trim()}
                  >
                    <Save className="h-3 w-3" />
                    Save Note
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => setDraftText("")}
                    disabled={!draftText}
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </Button>
                </div>
              </div>

              {/* Notes list */}
              {notes.length > 0 && (
                <div className="space-y-2 border-t border-border/30 pt-2">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded border border-border/40 bg-background/50 p-2 space-y-1"
                    >
                      {editingId === note.id ? (
                        <div className="space-y-1.5">
                          <Textarea
                            className="text-xs h-14 resize-none"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={handleEditSave}
                              disabled={!editText.trim()}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px] px-2"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs whitespace-pre-wrap">{note.text}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">
                              {formatTime(note.createdAt)}
                              {note.updatedAt && " (edited)"}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0"
                                onClick={() => {
                                  setEditingId(note.id);
                                  setEditText(note.text);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0 text-destructive"
                                onClick={() => setDeleteId(note.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              The note will be removed from display. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
