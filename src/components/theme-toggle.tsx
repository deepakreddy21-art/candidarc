"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tabs";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <Tooltip content={isDark ? "Switch to light theme" : "Switch to dark theme"}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        <Sun className="h-4 w-4 dark:hidden" />
        <Moon className="hidden h-4 w-4 dark:block" />
      </Button>
    </Tooltip>
  );
}
