"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Bell,
  Briefcase,
  FileText,
  Home,
  Moon,
  Plus,
  Radar,
  Search,
  Settings,
  Sparkles,
  Sun,
  Vault,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useUiStore } from "@/stores/ui";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const commands = [
  { id: "new-resume", label: "New resume", href: "/app/resumes/new", icon: FileText },
  { id: "new-opp", label: "New opportunity", href: "/app/opportunities/new", icon: Plus },
  { id: "active", label: "Open Cisco opportunity", href: "/app/opportunities/app-cisco", icon: Briefcase },
  { id: "radar", label: "Open Radar", href: "/app/radar", icon: Radar },
  { id: "radar-search", label: "Search fresh jobs", href: "/app/radar/search", icon: Search },
  { id: "radar-saved", label: "Open saved Radar jobs", href: "/app/radar/saved", icon: Radar },
  { id: "radar-alerts", label: "Manage Radar alerts", href: "/app/radar/alerts", icon: Bell },
  { id: "radar-cisco", label: "Open Cisco Radar job", href: "/app/radar/jobs/job-cisco-cx-ai", icon: Radar },
  { id: "evidence", label: "Open Career Evidence", href: "/app/evidence", icon: Vault },
  { id: "resume", label: "Open Resume Studio", href: "/app/opportunities/app-cisco/resume", icon: FileText },
  { id: "copilot", label: "Open Application Copilot", href: "/app/opportunities/app-cisco/application", icon: Sparkles },
  { id: "compare", label: "Compare resume versions", href: "/app/opportunities/app-cisco/resume?compare=1", icon: Sparkles },
  { id: "export", label: "Export final resume", href: "/app/opportunities/app-cisco/resume?export=1", icon: FileText },
  { id: "home", label: "Go to Today", href: "/app", icon: Home },
  { id: "settings", label: "Open settings", href: "/app/settings", icon: Settings },
];

export function CommandPalette() {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command className="bg-surface" label="Command palette">
          <Command.Input
            placeholder="Search commands..."
            className="h-12 w-full border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-foreground-muted"
          />
          <Command.List className="max-h-80 overflow-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-foreground-muted">No results</Command.Empty>
            <Command.Group heading="Navigate" className="px-1 text-xs text-foreground-muted">
              {commands.map((cmd) => (
                <Command.Item
                  key={cmd.id}
                  value={cmd.label}
                  onSelect={() => {
                    setOpen(false);
                    router.push(cmd.href);
                  }}
                  className="flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm text-foreground aria-selected:bg-surface-2"
                >
                  <cmd.icon className="h-4 w-4 text-foreground-muted" />
                  {cmd.label}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading="Preferences" className="mt-2 px-1 text-xs text-foreground-muted">
              <Command.Item
                value="Switch theme"
                onSelect={() => {
                  setTheme(resolvedTheme === "dark" ? "light" : "dark");
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm aria-selected:bg-surface-2"
              >
                {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                Switch theme
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function useCommandShortcutHint() {
  const pathname = usePathname();
  return pathname;
}
