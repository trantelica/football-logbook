import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/engine/preferencesContext";

export function ThemeToggle() {
  const { prefs, setPreference } = usePreferences();
  const dark = prefs.theme === "dark" || (
    prefs.theme === "system" &&
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
      aria-label={label}
      title={label}
      onClick={() => setPreference("theme", dark ? "light" : "dark")}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}