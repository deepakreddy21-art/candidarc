"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Bell, Briefcase, FileText, Menu, Search, Settings, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { Tooltip } from "@/components/ui/tabs";
import { useUiStore } from "@/stores/ui";
import { cn, isMacPlatform } from "@/lib/utils";
import { isRadarFeatureEnabled } from "@/lib/app-mode";
import { api } from "@/services/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const JOBS_HREF = "/app/radar";

const primaryNav = [
  ...(isRadarFeatureEnabled() ? [{ href: JOBS_HREF, label: "Jobs", icon: Briefcase }] : []),
  { href: "/app/opportunities", label: "Applications", icon: FileText },
  { href: "/app/settings/profile", label: "Resume", icon: FileText },
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
        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-surface-2 text-foreground" : "text-foreground-secondary hover:bg-surface-2 hover:text-foreground",
        collapsed && "justify-center px-2",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </Link>
  );
}

function isNavActive(pathname: string, href: string) {
  if (href === JOBS_HREF) {
    return pathname === "/app" || pathname === JOBS_HREF || pathname.startsWith(`${JOBS_HREF}/`);
  }
  if (href === "/app/settings/profile") {
    return pathname === "/app/settings/profile" || pathname.startsWith("/app/settings/profile/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
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
  const [displayName, setDisplayName] = useState("Account");
  const [displayEmail, setDisplayEmail] = useState("");
  const [initials, setInitials] = useState("?");

  useEffect(() => {
    setShortcut(isMacPlatform() ? "⌘K" : "Ctrl K");
  }, []);

  useEffect(() => {
    void api.getProfile().then((profile) => {
      setDisplayName(profile.fullName || profile.preferredName || "Account");
      setDisplayEmail(profile.email || "");
      setInitials(profile.avatarInitials || "?");
    });
  }, []);

  const crumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return parts.map((part, idx) => ({
      label:
        part === "app"
          ? "Jobs"
          : part === "opportunities"
            ? "Applications"
            : part === "radar"
              ? "Jobs"
              : part === "settings"
                ? "Settings"
                : part === "profile"
                  ? "Resume"
                  : part.startsWith("app-")
                    ? "Application"
                    : part,
      href: "/" + parts.slice(0, idx + 1).join("/"),
    }));
  }, [pathname]);

  const sidebar = (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-canvas transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-[220px]",
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-border px-4", collapsed && "justify-center px-2")}>
        <Link href={JOBS_HREF} aria-label="CandidArc Jobs" className="inline-flex">
          <Logo showWordmark={!collapsed} size="sm" />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <nav className="flex flex-col gap-1" aria-label="Primary">
          {primaryNav.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={isNavActive(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
        </nav>
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
              className="absolute inset-y-0 left-0 w-[min(100%,280px)] border-r border-border bg-canvas"
              initial={reduce ? false : { x: -24 }}
              animate={{ x: 0 }}
              exit={{ x: -24 }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
            >
              <div className="flex h-14 items-center justify-between border-b border-border px-4">
                <Link href={JOBS_HREF} aria-label="CandidArc Jobs" onClick={() => setMobileOpen(false)}>
                  <Logo size="sm" />
                </Link>
                <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-3" onClick={() => setMobileOpen(false)}>
                <nav className="flex flex-col gap-1" aria-label="Primary">
                  {primaryNav.map((item) => (
                    <NavItem
                      key={item.href}
                      {...item}
                      active={isNavActive(pathname, item.href)}
                      collapsed={false}
                    />
                  ))}
                </nav>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-canvas/95 px-3 backdrop-blur-sm sm:px-5">
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
                  {c.label}
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
              <Button variant="ghost" size="icon" aria-label="Notifications" asChild>
                <Link href={JOBS_HREF}>
                  <Bell className="h-4 w-4" />
                </Link>
              </Button>
            </Tooltip>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="User menu" className="rounded-full">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                    {initials}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm font-medium">{displayName}</div>
                  <div className="text-xs font-normal text-foreground-muted">{displayEmail}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/app/settings")}>
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/app/settings")}>Account</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    const csrf = decodeURIComponent(
                      document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1] ??
                        "",
                    );
                    await fetch("/api/v1/auth/logout", {
                      method: "POST",
                      credentials: "include",
                      headers: csrf ? { "x-csrf-token": csrf } : {},
                    });
                    router.push("/sign-in");
                  }}
                >
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 lg:px-8">
          {children}
        </main>

        <nav
          className="sticky bottom-0 z-30 flex border-t border-border bg-canvas/95 px-2 py-2 backdrop-blur md:hidden"
          aria-label="Mobile"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          {primaryNav.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-[11px]",
                  active ? "text-accent" : "text-foreground-muted",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <CommandPalette />
    </div>
  );
}
