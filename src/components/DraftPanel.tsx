import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { useTransaction } from "@/engine/transaction";
import { useGameContext } from "@/engine/gameContext";
import { useLookup } from "@/engine/lookupContext";
import { playSchema, SEGMENT_REQUIRED_FIELDS, QTR_DISPLAY } from "@/engine/schema";
import { canonicalizeLookupValue } from "@/engine/db";
import { cn } from "@/lib/utils";
import { Eraser, Eye, Check, ArrowLeft, Plus } from "lucide-react";
import { LookupConfirmDialog } from "./LookupConfirmDialog";
import { toast } from "sonner";

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
    backToEdit,
    commitProposal,
  } = useTransaction();
  const { getValues, isLookupField, addValue } = useLookup();

  const [confirmDialog, setConfirmDialog] = useState<{
    fieldName: string;
    fieldLabel: string;
    value: string;
  } | null>(null);

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

  // Check if a commit error is a lookup-not-recognized error
  function isLookupCommitError(fieldName: string): boolean {
    return !!(commitErrors[fieldName] && isLookupField(fieldName));
  }

  const handleAddLookupFromError = (fieldName: string) => {
    const value = (candidate as Record<string, unknown>)[fieldName];
    if (value == null || String(value).trim() === "") return;
    const fieldDef = playSchema.find((f) => f.name === fieldName);
    setConfirmDialog({
      fieldName,
      fieldLabel: fieldDef?.label ?? fieldName,
      value: String(value).trim(),
    });
  };

  const handleClearField = (fieldName: string) => {
    updateField(fieldName, "");
  };

  const borderClasses = isProposal
    ? "border-proposal bg-proposal-muted"
    : isDraft
      ? "border-candidate bg-candidate-muted"
      : "border-border";

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

    // LOOKUP-sourced string fields → combobox
    if (isLookupField(fieldName) && fieldDef.dataType === "string") {
      return (
        <div key={fieldName} className={fieldClasses}>
          <LookupCombobox
            fieldName={fieldName}
            fieldLabel={fieldDef.label}
            requiredAtCommit={fieldDef.requiredAtCommit}
            value={value != null ? String(value) : ""}
            onChange={(v) => updateField(fieldName, v)}
            onRequestAdd={(v) =>
              setConfirmDialog({ fieldName, fieldLabel: fieldDef.label, value: v })
            }
            lookupValues={getValues(fieldName)}
            disabled={isProposal}
            inputClassName={inputClasses}
            error={error}
          />
          {isLookupCommitError(fieldName) && (
            <div className="flex gap-1 mt-0.5">
              <Button
                size="sm"
                variant="outline"
                className="h-5 text-[10px] px-1.5 gap-0.5"
                onClick={() => handleAddLookupFromError(fieldName)}
              >
                <Plus className="h-2.5 w-2.5" />
                Add to lookup
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 text-[10px] px-1.5 text-destructive"
                onClick={() => handleClearField(fieldName)}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (fieldDef.allowedValues) {
      const displayLabel = (v: string) => {
        if (fieldName === "qtr") return QTR_DISPLAY[v] ?? v;
        return v;
      };
      return (
        <div key={fieldName} className={fieldClasses}>
          <Label className="text-xs font-medium text-muted-foreground">
            {fieldDef.label}
            {fieldDef.requiredAtCommit && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Select
            value={value != null ? String(value) : ""}
            onValueChange={(v) => updateField(fieldName, v)}
            disabled={isProposal}
          >
            <SelectTrigger className={inputClasses}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {fieldDef.allowedValues.map((v) => (
                <SelectItem key={v} value={v}>
                  {displayLabel(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );
    }

    if (fieldDef.dataType === "boolean") {
      return (
        <div key={fieldName} className={cn(fieldClasses, "flex items-center gap-2 pt-5")}>
          <Switch
            checked={value === true || value === "true"}
            onCheckedChange={(checked) => updateField(fieldName, checked)}
            disabled={isProposal}
          />
          <Label className="text-xs font-medium text-muted-foreground">
            {fieldDef.label}
          </Label>
        </div>
      );
    }

    return (
      <div key={fieldName} className={fieldClasses}>
        <Label className="text-xs font-medium text-muted-foreground">
          {fieldDef.label}
          {fieldDef.requiredAtCommit && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <Input
          className={inputClasses}
          type="text"
          inputMode={fieldDef.dataType === "integer" ? "numeric" : "text"}
          value={value != null ? String(value) : ""}
          onChange={(e) => updateField(fieldName, e.target.value)}
          placeholder="—"
          disabled={isProposal}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  return (
    <>
      <div
        className={cn(
          "rounded-lg border-2 p-4 space-y-4",
          borderClasses
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
          <div className={cn(
            "text-xs rounded px-2 py-1",
            isProposal
              ? "text-proposal-foreground bg-proposal/20"
              : "text-candidate-foreground bg-candidate/20"
          )}>
            Segment row (ODK=S): Only Play #, Quarter, and ODK are required.
          </div>
        )}

        {commitErrors._noop && (
          <div className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
            {commitErrors._noop}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {playSchema.map((f) => renderField(f.name))}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border/30">
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
          {isProposal && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={backToEdit}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Edit
              </Button>
              <Button
                size="sm"
                className="gap-1 bg-proposal text-proposal-foreground hover:bg-proposal/90"
                onClick={commitProposal}
              >
                <Check className="h-3.5 w-3.5" />
                Commit
              </Button>
            </>
          )}
        </div>
      </div>

      {confirmDialog && (
        <LookupConfirmDialog
          open
          fieldLabel={confirmDialog.fieldLabel}
          value={confirmDialog.value}
          onConfirm={async () => {
            const { fieldName, value } = confirmDialog;
            try {
              await addValue(fieldName, value);
              updateField(fieldName, value);
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : "Failed to add value");
              updateField(fieldName, "");
            }
            setConfirmDialog(null);
          }}
          onCancel={() => {
            updateField(confirmDialog.fieldName, "");
            setConfirmDialog(null);
          }}
        />
      )}
    </>
  );
}

// ── Lookup Combobox Sub-Component ──

interface LookupComboboxProps {
  fieldName: string;
  fieldLabel: string;
  requiredAtCommit: boolean;
  value: string;
  onChange: (value: string) => void;
  onRequestAdd: (value: string) => void;
  lookupValues: string[];
  disabled: boolean;
  inputClassName: string;
  error?: string;
}

function LookupCombobox({
  fieldName,
  fieldLabel,
  requiredAtCommit,
  value,
  onChange,
  onRequestAdd,
  lookupValues,
  disabled,
  inputClassName,
  error,
}: LookupComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const typedValue = search || value;
  const typedCanonical = canonicalizeLookupValue(typedValue);

  const filtered = lookupValues.filter((v) =>
    canonicalizeLookupValue(v).includes(typedCanonical)
  );

  const isNovelValue =
    typedValue.trim() !== "" &&
    !lookupValues.some((v) => canonicalizeLookupValue(v) === typedCanonical);

  return (
    <>
      <Label className="text-xs font-medium text-muted-foreground">
        {fieldLabel}
        {requiredAtCommit && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Input
            className={inputClassName}
            value={search || value}
            onChange={(e) => {
              const v = e.target.value;
              setSearch(v);
              onChange(v);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={lookupValues.length === 0 ? "No values yet. Type to add." : "—"}
            disabled={disabled}
          />
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Command>
            <CommandList>
              {filtered.length === 0 && !isNovelValue && (
                <CommandEmpty className="text-xs py-2 text-center">No matching values.</CommandEmpty>
              )}
              <CommandGroup>
                {filtered.map((v) => (
                  <CommandItem
                    key={v}
                    value={v}
                    onSelect={() => {
                      onChange(v);
                      setSearch("");
                      setOpen(false);
                    }}
                    className="text-xs font-mono"
                  >
                    {v}
                  </CommandItem>
                ))}
                {isNovelValue && (
                  <CommandItem
                    value={`__add__${typedValue}`}
                    onSelect={() => {
                      onRequestAdd(typedValue.trim());
                      setSearch("");
                      setOpen(false);
                    }}
                    className="text-xs gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Add "{typedValue.trim()}"
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </>
  );
}
