import { useState } from "react";
import { SeasonProvider, useSeason } from "@/engine/seasonContext";
import { GameProvider, useGameContext } from "@/engine/gameContext";
import { LookupProvider } from "@/engine/lookupContext";
import { RosterProvider } from "@/engine/rosterContext";
import { RawInputProvider } from "@/engine/rawInputContext";
import { TransactionProvider } from "@/engine/transaction";
import { GameBar } from "@/components/GameBar";
import { PlayHUD } from "@/components/PlayHUD";
import { PassRail } from "@/components/PassRail";
import { DraftPanel } from "@/components/DraftPanel";
import { VoiceAnnouncer } from "@/components/VoiceAnnouncer";
import { OverwriteReview } from "@/components/OverwriteReview";
import { StatusBar } from "@/components/StatusBar";
import { WelcomeScreen } from "@/components/WelcomeScreen";

/**
 * Workspace shell.
 *
 * Previously every surface was stacked into one scrolling column: draft entry,
 * the full slots table, lookup management, roster, and a second full plays
 * table. On an 80-play game that put ~160 rows of grid below the panel the
 * coach was actually working in, and selecting a play meant scrolling a
 * spreadsheet and then scrolling back up.
 *
 * Now the regions are separated by job and scroll independently:
 *
 *   GameBar    — season/game identity and workspace settings
 *   PlayHUD    — persistent orientation, glanceable in about a second
 *   PassRail   — play navigation only
 *   DraftPanel — the work surface, which owns the remaining space
 *   StatusBar  — exports, plus on-demand ledger and reference drawers
 *
 * Reference data (lookups, roster) and the full grid moved into drawers. They
 * are reference material, consulted occasionally — they should not compete with
 * the work surface for vertical space on every play.
 */
const AppShell = () => {
  const { activeGame } = useGameContext();
  const { restoringSession } = useSeason();
  const [dismissed, setDismissed] = useState(false);

  // Reading seasons and games is async, so activeGame is briefly null even when
  // a session is about to be restored. Rendering the welcome screen during that
  // window would flash it on every launch for a returning coach.
  if (restoringSession) {
    return <div className="h-screen bg-background" aria-busy="true" />;
  }

  const showWelcome = !activeGame && !dismissed;

  if (showWelcome) {
    return <WelcomeScreen onBegin={() => setDismissed(true)} />;
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <GameBar />

      {activeGame ? (
        <>
          <PlayHUD />
          {/* min-h-0 lets the two scroll regions size to the flex row rather
              than to their content, which is what keeps the page itself from
              scrolling. */}
          <div className="flex min-h-0 flex-1">
            <PassRail />
            <main className="min-w-0 flex-1 overflow-auto p-4">
              <DraftPanel />
              <div id="dev-tools-slot" />
            </main>
          </div>
        </>
      ) : (
        <main className="flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">
            Create or select a game to begin logging plays.
          </p>
        </main>
      )}

      {/* Headless: watches transaction state and speaks the moments that
          matter, so the coach does not have to look up to confirm them. */}
      <VoiceAnnouncer />

      <OverwriteReview />
      <StatusBar />
    </div>
  );
};

const Index = () => {
  return (
    <SeasonProvider>
      <GameProvider>
        <LookupProvider>
          <RosterProvider>
            <RawInputProvider>
              <TransactionProvider>
                <AppShell />
              </TransactionProvider>
            </RawInputProvider>
          </RosterProvider>
        </LookupProvider>
      </GameProvider>
    </SeasonProvider>
  );
};

export default Index;
