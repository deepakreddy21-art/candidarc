"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type ThemePreference = "light" | "dark" | "system";

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandOpen: boolean;
  themePreference: ThemePreference;
  demoState: "default" | "empty" | "loading" | "error" | "offline";
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (v: boolean) => void;
  setCommandOpen: (v: boolean) => void;
  setThemePreference: (v: ThemePreference) => void;
  setDemoState: (v: UiState["demoState"]) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      commandOpen: false,
      themePreference: "system",
      demoState: "default",
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setThemePreference: (themePreference) => set({ themePreference }),
      setDemoState: (demoState) => set({ demoState }),
    }),
    { name: "candidarc-ui", partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, themePreference: s.themePreference }) },
  ),
);

interface OnboardingState {
  step: number;
  data: Record<string, unknown>;
  setStep: (step: number) => void;
  patch: (data: Record<string, unknown>) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  step: 0,
  data: {},
  setStep: (step) => set({ step }),
  patch: (data) => set((s) => ({ data: { ...s.data, ...data } })),
  reset: () => set({ step: 0, data: {} }),
}));
