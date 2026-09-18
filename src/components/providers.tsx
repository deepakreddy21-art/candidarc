"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tabs";
import { Toaster } from "sonner";

/** Light-only: ignore OS/system preference and clear stale dark class. */
export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    document.documentElement.classList.remove("dark");
    try {
      localStorage.setItem("theme", "light");
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <NextThemesProvider attribute="class" defaultTheme="light" forcedTheme="light" enableSystem={false} disableTransitionOnChange>
      <TooltipProvider>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: "border border-border bg-surface text-foreground shadow-[var(--shadow-md)]",
          }}
        />
      </TooltipProvider>
    </NextThemesProvider>
  );
}
