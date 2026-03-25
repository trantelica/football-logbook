import { SeasonProvider } from "@/engine/seasonContext";
import { GameProvider } from "@/engine/gameContext";
import { LookupProvider } from "@/engine/lookupContext";
import { RosterProvider } from "@/engine/rosterContext";
import { RawInputProvider } from "@/engine/rawInputContext";
import { TransactionProvider } from "@/engine/transaction";
import { GameBar } from "@/components/GameBar";
import { DraftPanel } from "@/components/DraftPanel";
import { SlotsGrid } from "@/components/SlotsGrid";
import { CommittedPlaysPanel } from "@/components/CommittedPlaysPanel";
import { OverwriteReview } from "@/components/OverwriteReview";
import { StatusBar } from "@/components/StatusBar";
import { LookupPanel } from "@/components/LookupPanel";
import { RosterPanel } from "@/components/RosterPanel";
import { TranscriptPanel } from "@/components/TranscriptPanel";

const Index = () => {
  return (
    <SeasonProvider>
      <GameProvider>
        <LookupProvider>
          <RosterProvider>
            <RawInputProvider>
              <TransactionProvider>
                <div className="flex flex-col h-screen bg-background">
                  <GameBar />

                  <main className="flex-1 overflow-auto p-4 space-y-4">
                    <DraftPanel />
                    <TranscriptPanel />
                    <SlotsGrid />
                    <LookupPanel />
                    <RosterPanel />
                    <CommittedPlaysPanel />
                  </main>

                  <OverwriteReview />
                  <StatusBar />
                </div>
              </TransactionProvider>
            </RawInputProvider>
          </RosterProvider>
        </LookupProvider>
      </GameProvider>
    </SeasonProvider>
  );
};

export default Index;
