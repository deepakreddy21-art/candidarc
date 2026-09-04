"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/app/settings", label: "Overview", exact: true },
  { href: "/app/settings/profile", label: "Profile" },
  { href: "/app/settings/preferences", label: "Preferences" },
  { href: "/app/settings/integrations", label: "Integrations" },
  { href: "/app/settings/privacy", label: "Privacy" },
  { href: "/app/settings/billing", label: "Billing" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-border bg-surface p-3">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">Settings</p>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Settings">
          {links.map((link) => {
            const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "shrink-0 rounded-[10px] px-3 py-2 text-sm",
                  active ? "bg-surface-2 font-medium text-foreground" : "text-foreground-secondary hover:bg-surface-2",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  );
}
