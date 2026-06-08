import { Button } from "@/components/ui/button";

interface WelcomeScreenProps {
  onBegin: () => void;
}

export function WelcomeScreen({ onBegin }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-8">
      <div className="flex flex-col items-center max-w-md text-center space-y-8">
        {/* HERO vector */}
        <div className="relative">
          <svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="80" cy="80" r="74" stroke="hsl(var(--primary))" strokeWidth="2" opacity="0.25" />
            <circle cx="80" cy="80" r="56" stroke="hsl(var(--primary))" strokeWidth="2" opacity="0.5" />
            <ellipse
              cx="80"
              cy="80"
              rx="36"
              ry="22"
              fill="hsl(var(--primary) / 0.15)"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
            />
            <path
              d="M 50 80 L 110 80 M 70 72 L 70 88 M 80 70 L 80 90 M 90 72 L 90 88"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Hudl Up! -loader</h1>
          <p className="text-lg text-muted-foreground">AI Video Technician</p>
        </div>

        <Button size="lg" onClick={onBegin} className="min-w-32">
          Begin
        </Button>
      </div>
    </div>
  );
}
