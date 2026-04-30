import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TranscriptPanel } from "@/components/TranscriptPanel";

let currentText = "12 at C";
const applySystemPatch = vi.fn();
const clear = vi.fn();

vi.mock("@/hooks/useTranscriptCapture", () => ({
  useTranscriptCapture: () => ({
    text: currentText,
    interim: "",
    listening: false,
    supported: true,
    hasContent: currentText.trim().length > 0,
    setText: vi.fn(),
    toggleListening: vi.fn(),
    clear,
  }),
}));

vi.mock("@/engine/transaction", () => ({
  useTransaction: () => ({
    applySystemPatch,
    commitCount: 0,
  }),
}));

vi.mock("@/engine/seasonContext", () => ({
  useSeason: () => ({
    activeSeason: { seasonId: "season-1" },
  }),
}));

vi.mock("@/engine/rosterContext", () => ({
  useRoster: () => ({
    roster: [],
    addPlayer: vi.fn(),
    getPlayer: vi.fn(),
  }),
}));

vi.mock("@/engine/db", () => ({
  getSeasonConfig: vi.fn(async () => ({ positionAliases: {} })),
}));

vi.mock("@/components/RosterResolveDialog", () => ({
  RosterResolveDialog: ({ open, pending, onResolved, onCancel }: any) =>
    open ? (
      <div data-testid="mock-roster-resolve-dialog">
        <button onClick={() => onResolved(pending.map((p: any) => p.jersey))}>
          Resolve off-roster mock
        </button>
        <button onClick={onCancel}>Cancel off-roster mock</button>
      </div>
    ) : null,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

describe("TranscriptPanel off-roster blocked banner cleanup", () => {
  beforeEach(() => {
    currentText = "12 at C";
    applySystemPatch.mockReset();
    applySystemPatch.mockReturnValue([]);
    clear.mockReset();
  });

  it("removes the blocked banner after successful off-roster resolution + re-apply", async () => {
    render(<TranscriptPanel activePass={2} currentCandidate={{}} />);

    fireEvent.click(screen.getByRole("button", { name: /update proposal/i }));

    expect(screen.getByText(/personnel assignments blocked/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /resolve off-roster mock/i }));

    await waitFor(() => {
      expect(screen.queryByText(/personnel assignments blocked/i)).not.toBeInTheDocument();
    });

    expect(applySystemPatch).toHaveBeenCalledWith(
      { posC: 12 },
      expect.objectContaining({ fillOnly: true, source: "deterministic_parse" }),
    );
    expect(screen.getByText(/posC: 12/i)).toBeInTheDocument();
  });

  it("keeps the blocked banner when resolution is canceled", async () => {
    render(<TranscriptPanel activePass={2} currentCandidate={{}} />);

    fireEvent.click(screen.getByRole("button", { name: /update proposal/i }));

    expect(screen.getByText(/personnel assignments blocked/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel off-roster mock/i }));

    await waitFor(() => {
      expect(screen.getByText(/personnel assignments blocked/i)).toBeInTheDocument();
    });

    expect(applySystemPatch).not.toHaveBeenCalled();
  });
});