import { useState, useEffect } from "react";
import { SeasonProvider, useSeason } from "@/engine/seasonContext";
import { GameProvider, useGameContext } from "@/engine/gameContext";
import { LookupProvider } from "@/engine/lookupContext";
import { RosterProvider } from "@/engine/rosterContext";
import { RawInputProvider } from "@/engine/rawInputContext";
import { TransactionProvider, useTransaction } from "@/engine/transaction";
import { GameBar } from "@/components/GameBar";
import { PlayHUD } from "@/components/PlayHUD";
import { PassRail } from "@/components/PassRail";
import { DraftPanel } from "@/components/DraftPanel";
import { VoiceAnnouncer } from "@/components/VoiceAnnouncer";
import { OverwriteReview } from "@/components/OverwriteReview";
import { StatusBar } from "@/components/StatusBar";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { toast } from "sonner";

/**
 * Workspace shell.
 */
const AppShell = () => {
  const { activeGame } = useGameContext();
  const { restoringSession } = useSeason();
  const { setActivePass, activePass } = useTransaction();
  const [dismissed, setDismissed] = useState(false);

  // Global keyboard shortcuts for switching passes (Alt+1, Alt+2, Alt+3)
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      // Only fire if not in a dialog and not editing text
      const isDialog = !!document.querySelector('[role="dialog"]');
      const isInput = ["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName);
      
      if (isDialog || isInput) return;

      if (e.altKey && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        const pass = Number(e.key);
        if (pass !== activePass) {
          setActivePass(pass);
          toast.info(`Switched to Pass ${pass}`);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, [activePass, setActivePass]);

  if (restoringSession) {
    return <div className="h-screen bg-background" aria-busy="true" />;
  }

  const showWelcome = !activeGame && !dismissed;

  if (showWelcome) {
    return <WelcomeScreen onBegin={() => setDismissed(true)} />;
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Skip to Content - Screen reader and keyboard convenience */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      <GameBar />

      {activeGame ? (
        <>
          <PlayHUD />
          {/* min-h-0 lets the two scroll regions size to the flex row rather
              than to their content, which is what keeps the page itself from
              scrolling. */}
          <div className="flex min-h-0 flex-1">
            <PassRail />
            <main id="main-content" className="min-w-0 flex-1 overflow-auto p-4 focus:outline-none" tabIndex={-1}>
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
