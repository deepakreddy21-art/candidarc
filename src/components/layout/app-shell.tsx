"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Bell,
  Briefcase,
  FileText,
  Home,
  Menu,
  Plus,
  Radar,
  Search,
  Settings,
  Vault,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { Tooltip } from "@/components/ui/tabs";
import { useUiStore } from "@/stores/ui";
import { cn, isMacPlatform } from "@/lib/utils";
import { candidate, notifications } from "@/data/seed";
import { useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const primaryNav = [
  { href: "/app", label: "Today", icon: Home },
  { href: "/app/resumes/new", label: "New resume", icon: FileText },
  { href: "/app/radar", label: "Radar", icon: Radar },
  { href: "/app/opportunities", label: "Opportunities", icon: Briefcase },
  { href: "/app/evidence", label: "Career Evidence", icon: Vault },
];

const mobileNav = primaryNav;

const opportunitySubNav = [
  { segment: "", label: "Overview" },
  { segment: "research", label: "Research" },
  { segment: "evidence", label: "Evidence" },
  { segment: "resume", label: "Resume" },
  { segment: "audits", label: "Audits" },
  { segment: "application", label: "Application" },
  { segment: "activity", label: "Activity" },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium transition-colors",
        active ? "text-foreground" : "text-foreground-secondary hover:bg-surface-2 hover:text-foreground",
        collapsed && "justify-center px-2",
      )}
      aria-current={active ? "page" : undefined}
    >
      {active ? (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-[12px] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      ) : null}
      <Icon className="relative z-10 h-4 w-4 shrink-0" />
      {!collapsed ? <span className="relative z-10">{label}</span> : <span className="sr-only">{label}</span>}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const mobileOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileOpen = useUiStore((s) => s.setMobileNavOpen);
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);
  const [shortcut, setShortcut] = useState("Ctrl K");
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    setShortcut(isMacPlatform() ? "⌘K" : "Ctrl K");
  }, []);

  const opportunityMatch = pathname.match(/^\/app\/opportunities\/(app-[^/]+)/);
  const opportunityId = opportunityMatch?.[1];

  const crumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return parts.map((part, idx) => ({
      label: part.startsWith("app-") ? part.replace("app-", "").replace(/^\w/, (c) => c.toUpperCase()) : part,
      href: "/" + parts.slice(0, idx + 1).join("/"),
    }));
  }, [pathname]);

  const sidebar = (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-canvas transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-[240px]",
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-border px-4", collapsed && "justify-center px-2")}>
        <Logo showWordmark={!collapsed} size="sm" />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <nav className="flex flex-col gap-1" aria-label="Primary">
          {primaryNav.map((item) => {
            const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
            return (
              <NavItem
                key={item.href}
                {...item}
                active={active}
                collapsed={collapsed}
              />
            );
          })}
        </nav>
        {opportunityId && !collapsed ? (
          <div className="mt-6">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
              Workspace
            </p>
            <nav className="flex flex-col gap-0.5" aria-label="Opportunity">
              {opportunitySubNav.map((item) => {
                const href =
                  item.segment === ""
                    ? `/app/opportunities/${opportunityId}`
                    : `/app/opportunities/${opportunityId}/${item.segment}`;
                const active =
                  item.segment === ""
                    ? pathname === href
                    : pathname.startsWith(href);
                return (
                  <Link
                    key={item.label}
                    href={href}
                    className={cn(
                      "rounded-[10px] px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-surface text-foreground font-medium"
                        : "text-foreground-secondary hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : null}
      </div>
      <div className="border-t border-border p-3">
        <Button
          className={cn("w-full", collapsed && "px-0")}
          onClick={() => router.push("/app/resumes/new")}
          aria-label="New resume"
        >
          <Plus className="h-4 w-4" />
          {!collapsed ? "New resume" : null}
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="hidden md:block">{sidebar}</div>
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="absolute inset-y-0 left-0 w-[min(100%,280px)] bg-canvas shadow-[var(--shadow-md)]"
              initial={reduce ? false : { x: -24 }}
              animate={{ x: 0 }}
              exit={{ x: -24 }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
            >
              <div className="flex h-14 items-center justify-between border-b border-border px-4">
                <Logo size="sm" />
                <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-3" onClick={() => setMobileOpen(false)}>
                <nav className="flex flex-col gap-1">
                  {primaryNav.map((item) => {
                    const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
                    return <NavItem key={item.href} {...item} active={active} collapsed={false} />;
                  })}
                </nav>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-canvas/90 px-3 backdrop-blur-md sm:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebar}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </Tooltip>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-foreground-muted lg:flex">
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex items-center gap-1">
                {i > 0 ? <span>/</span> : null}
                <Link href={c.href} className="truncate capitalize hover:text-foreground">
                  {c.label === "app" ? "Today" : c.label}
                </Link>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => setCommandOpen(true)}
              aria-label="Open command palette"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="text-foreground-muted">{shortcut}</span>
            </Button>
            <Tooltip content="Notifications">
              <Button variant="ghost" size="icon" aria-label={`Notifications, ${unread} unread`} asChild>
                <Link href="/app">
                  <span className="relative">
                    <Bell className="h-4 w-4" />
                    {unread > 0 ? (
                      <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent" />
                    ) : null}
                  </span>
                </Link>
              </Button>
            </Tooltip>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="User menu" className="rounded-full">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                    {candidate.avatarInitials}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm font-medium">{candidate.fullName}</div>
                  <div className="text-xs font-normal text-foreground-muted">{candidate.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/app/settings/profile")}>Profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/app/settings/preferences")}>Preferences</DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/app/settings/privacy")}>Privacy</DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/app/settings/integrations")}>Integrations</DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/app/settings/billing")}>Billing</DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/app/settings")}>
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  Account
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/sign-in")}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <motion.div
            key={pathname}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </main>

        <nav
          className="sticky bottom-0 z-30 flex border-t border-border bg-canvas/95 px-2 py-2 backdrop-blur md:hidden"
          aria-label="Mobile"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          {mobileNav.map((item) => {
            const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-[10px] text-[10px]",
                  active ? "text-accent" : "text-foreground-muted",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label.split(" ")[0]}
              </Link>
            );
          })}
        </nav>
      </div>
      <CommandPalette />
    </div>
  );
}
