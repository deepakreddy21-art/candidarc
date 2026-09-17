import { describe, expect, it } from "vitest";
import { mapLoadedOnboardingStep } from "@/lib/onboarding-flow";
import {
  breadcrumbLabel,
  getPrimaryNavItems,
  isPrimaryNavActive,
  JOBS_HREF,
  PROFILE_HREF,
  RESUMES_HREF,
  SETTINGS_HREF,
} from "@/lib/primary-nav";

describe("primary navigation contract", () => {
  it("keeps Jobs, Applications, Resumes, and Profile as distinct destinations", () => {
    const labels = getPrimaryNavItems().map((item) => item.label);
    expect(labels).toEqual(["Jobs", "Applications", "Resumes", "Profile"]);
    expect(getPrimaryNavItems().find((item) => item.label === "Resumes")?.href).toBe(RESUMES_HREF);
    expect(getPrimaryNavItems().find((item) => item.label === "Profile")?.href).toBe(PROFILE_HREF);
    expect(labels).not.toContain("Settings");
  });

  it("does not treat settings as the Resume or Profile section", () => {
    expect(isPrimaryNavActive("/app/settings/billing", RESUMES_HREF)).toBe(false);
    expect(isPrimaryNavActive("/app/settings", PROFILE_HREF)).toBe(false);
    expect(isPrimaryNavActive("/app/profile", PROFILE_HREF)).toBe(true);
    expect(isPrimaryNavActive("/app/resumes", RESUMES_HREF)).toBe(true);
    expect(isPrimaryNavActive("/app/resumes/new", RESUMES_HREF)).toBe(true);
    expect(isPrimaryNavActive("/app/radar", JOBS_HREF)).toBe(true);
    expect(isPrimaryNavActive("/app/settings", SETTINGS_HREF)).toBe(true);
  });

  it("labels crumbs without using Resume for Profile", () => {
    expect(breadcrumbLabel("profile")).toBe("Profile");
    expect(breadcrumbLabel("settings")).toBe("Settings");
    expect(breadcrumbLabel("resumes")).toBe("Resumes");
    expect(breadcrumbLabel("notifications")).toBe("Notifications");
  });
});

describe("onboarding step mapping", () => {
  it("maps historical four-step progress onto three visible steps", () => {
    expect(mapLoadedOnboardingStep(0)).toBe(0);
    expect(mapLoadedOnboardingStep(1)).toBe(0);
    expect(mapLoadedOnboardingStep(2)).toBe(1);
    expect(mapLoadedOnboardingStep(3)).toBe(2);
  });

  it("keeps v3 steps as-is", () => {
    expect(mapLoadedOnboardingStep(1, 3)).toBe(1);
    expect(mapLoadedOnboardingStep(2, 3)).toBe(2);
  });
});
