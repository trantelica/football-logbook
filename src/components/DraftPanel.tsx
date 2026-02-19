import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTransaction } from "@/engine/transaction";
import { useGameContext } from "@/engine/gameContext";
import { playSchema, ODK_VALUES, QTR_VALUES, DN_VALUES, HASH_VALUES, SEGMENT_REQUIRED_FIELDS } from "@/engine/schema";
import { cn } from "@/lib/utils";
import { Eraser, Eye, Check } from "lucide-react";

export function DraftPanel() {
  const { activeGame } = useGameContext();
  const {
    state,
    candidate,
    touchedFields,
    inlineErrors,
    commitErrors,
    updateField,
    clearDraft,
    reviewProposal,
    commitProposal,
  } = useTransaction();

  if (!activeGame) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Create or select a game to begin logging plays.
      </div>
    );
  }

  const isSegment = candidate.odk === "S";
  const errors = { ...inlineErrors, ...commitErrors };
  const isProposal = state === "proposal";
  const isDraft = state === "candidate" || state === "proposal";

  function getError(field: string) {
    return errors[field];
  }

  function isTouched(field: string) {
    return touchedFields.has(field);
  }

  function isMinimalField(field: string) {
    return (SEGMENT_REQUIRED_FIELDS as readonly string[]).includes(field) || field === "playNum";
  }

  function isDeemphasized(field: string) {
    return isSegment && !isMinimalField(field);
  }

  const renderField = (fieldName: string) => {
    const fieldDef = playSchema.find((f) => f.name === fieldName);
    if (!fieldDef) return null;

    const value = (candidate as Record<string, unknown>)[fieldName];
    const error = getError(fieldName);
    const touched = isTouched(fieldName);
    const deemphasized = isDeemphasized(fieldName);

    const fieldClasses = cn(
      "space-y-1",
      deemphasized && "opacity-40"
    );

    const inputClasses = cn(
      "h-8 text-sm font-mono",
      touched && !error && "bg-field-touched",
      error && "border-destructive"
    );

    // Enum fields render as Select
    if (fieldDef.dataType === "enum" && fieldDef.allowedValues) {
      return (
        <div key={fieldName} className={fieldClasses}>
          <Label className="text-xs font-medium text-muted-foreground">
            {fieldDef.label}
            {fieldDef.requiredAtCommit && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Select
            value={(value as string) ?? ""}
            onValueChange={(v) => updateField(fieldName, v)}
          >
            <SelectTrigger className={inputClasses}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {fieldDef.allowedValues.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );
    }

    // Boolean fields render as Switch
    if (fieldDef.dataType === "boolean") {
      return (
        <div key={fieldName} className={cn(fieldClasses, "flex items-center gap-2 pt-5")}>
          <Switch
            checked={value === true || value === "true"}
            onCheckedChange={(checked) => updateField(fieldName, checked)}
          />
          <Label className="text-xs font-medium text-muted-foreground">
            {fieldDef.label}
          </Label>
        </div>
      );
    }

    // Integer and string fields render as Input
    return (
      <div key={fieldName} className={fieldClasses}>
        <Label className="text-xs font-medium text-muted-foreground">
          {fieldDef.label}
          {fieldDef.requiredAtCommit && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <Input
          className={inputClasses}
          type={fieldDef.dataType === "integer" ? "text" : "text"}
          inputMode={fieldDef.dataType === "integer" ? "numeric" : "text"}
          value={value != null ? String(value) : ""}
          onChange={(e) => updateField(fieldName, e.target.value)}
          placeholder="—"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "rounded-lg border-2 p-4 space-y-4",
        isDraft ? "border-draft bg-draft-muted" : "border-border"
      )}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          {isProposal ? "Proposal Review" : "Draft Entry"}
        </h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={clearDraft}
          >
            <Eraser className="h-3 w-3" />
            Clear Draft
          </Button>
        </div>
      </div>

      {isSegment && (
        <div className="text-xs text-draft-foreground bg-draft/20 rounded px-2 py-1">
          Segment row (ODK=S): Only Play #, Quarter, and ODK are required.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {playSchema.map((f) => renderField(f.name))}
      </div>

      <div className="flex gap-2 pt-2 border-t border-draft/30">
        {!isProposal && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={reviewProposal}
            disabled={touchedFields.size === 0}
          >
            <Eye className="h-3.5 w-3.5" />
            Review Proposal
          </Button>
        )}
        <Button
          size="sm"
          className="gap-1 bg-committed text-committed-foreground hover:bg-committed/90"
          onClick={commitProposal}
          disabled={touchedFields.size === 0}
        >
          <Check className="h-3.5 w-3.5" />
          Commit
        </Button>
      </div>
    </div>
  );
}
