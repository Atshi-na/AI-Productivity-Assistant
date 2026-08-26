import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Sun / moon segmented switch — the active mode is visibly highlighted. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      role="group"
      aria-label="Color theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-secondary/70 p-0.5",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-label="Switch to light mode"
        aria-pressed={!isDark}
        title="Light mode"
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
          !isDark
            ? "bg-card text-primary shadow-sm ring-1 ring-border"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Sun className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-label="Switch to dark mode"
        aria-pressed={isDark}
        title="Dark mode"
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
          isDark
            ? "bg-card text-primary shadow-sm ring-1 ring-border"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Moon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
