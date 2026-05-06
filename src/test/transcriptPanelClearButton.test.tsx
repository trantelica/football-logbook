import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TranscriptPanel } from "@/components/TranscriptPanel";

// U1: Clear must remain visible while listening when content exists.
vi.mock("@/hooks/useTranscriptCapture", () => ({
  useTranscriptCapture: () => ({
    text: "we run 26 from black formation",
    interim: "",
    listening: true,
    supported: true,
    hasContent: true,
    setText: vi.fn(),
    toggleListening: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock("@/engine/transaction", () => ({
  useTransaction: () => ({ applySystemPatch: vi.fn(() => []), commitCount: 0 }),
}));

vi.mock("@/engine/seasonContext", () => ({
  useSeason: () => ({ activeSeason: { seasonId: "season-1" } }),
}));

vi.mock("@/engine/rosterContext", () => ({
  useRoster: () => ({ roster: [], addPlayer: vi.fn(), getPlayer: vi.fn() }),
}));

vi.mock("@/engine/db", () => ({
  getSeasonConfig: vi.fn(async () => ({ positionAliases: {} })),
}));

vi.mock("@/components/RosterResolveDialog", () => ({
  RosterResolveDialog: () => null,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

describe("TranscriptPanel — Slice U1 Clear button visibility", () => {
  it("renders Clear while dictation is active when content exists", () => {
    render(<TranscriptPanel activePass={1} currentCandidate={{}} />);
    const clearBtn = screen.getByRole("button", { name: /clear/i });
    expect(clearBtn).toBeInTheDocument();
    expect(clearBtn).not.toBeDisabled();
  });
});
