"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/app/resumes", label: "Tailored resumes", exact: true },
  { href: "/app/resumes/new", label: "Tailor a resume" },
];

export default function ResumesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSubnav = pathname === "/app/resumes" || pathname === "/app/resumes/new";

  return (
    <div className="space-y-6">
      {showSubnav ? (
        <nav className="flex gap-1 overflow-x-auto" aria-label="Resume">
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
      ) : null}
      {children}
    </div>
  );
}
