"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type NavigationPendingContextValue = {
  pendingHref: string | null;
  markPending: (href: string) => void;
};

const NavigationPendingContext = createContext<NavigationPendingContextValue>({
  pendingHref: null,
  markPending: () => undefined,
});

export function NavigationPendingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const markPending = useCallback((href: string) => {
    const nextPath = href.split("?")[0] ?? href;
    if (nextPath === pathname) return;
    setPendingHref(href);
  }, [pathname]);

  return (
    <NavigationPendingContext.Provider value={{ pendingHref, markPending }}>
      {children}
      {pendingHref ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="nav-pending"
          className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-0.5 overflow-hidden bg-accent/30"
        >
          <span className="sr-only">Opening {pendingHref}</span>
          <div className="h-full w-1/3 animate-pulse bg-accent" />
        </div>
      ) : null}
    </NavigationPendingContext.Provider>
  );
}

export function useNavigationPending() {
  return useContext(NavigationPendingContext);
}
