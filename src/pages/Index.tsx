import { GameProvider } from "@/engine/gameContext";
import { TransactionProvider } from "@/engine/transaction";
import { GameBar } from "@/components/GameBar";
import { DraftPanel } from "@/components/DraftPanel";
import { CommittedPlaysPanel } from "@/components/CommittedPlaysPanel";
import { OverwriteReview } from "@/components/OverwriteReview";
import { StatusBar } from "@/components/StatusBar";

const Index = () => {
  return (
    <GameProvider>
      <TransactionProvider>
        <div className="flex flex-col h-screen bg-background">
          <GameBar />

          <main className="flex-1 overflow-auto p-4 space-y-4">
            <DraftPanel />
            <CommittedPlaysPanel />
          </main>

          <OverwriteReview />
          <StatusBar />
        </div>
      </TransactionProvider>
    </GameProvider>
  );
};

export default Index;
