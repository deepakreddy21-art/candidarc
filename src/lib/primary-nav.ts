import { isRadarFeatureEnabled } from "@/lib/app-mode";

export const JOBS_HREF = "/app/radar";
export const APPLICATIONS_HREF = "/app/opportunities";
export const RESUMES_HREF = "/app/resumes";
export const PROFILE_HREF = "/app/profile";
export const SETTINGS_HREF = "/app/settings";
export const NOTIFICATIONS_HREF = "/app/notifications";

/** @deprecated use RESUMES_HREF */
export const RESUME_HREF = RESUMES_HREF;

export type PrimaryNavItem = {
  href: string;
  label: "Jobs" | "Applications" | "Resumes" | "Profile";
};

export function getPrimaryNavItems(): PrimaryNavItem[] {
  return [
    ...(isRadarFeatureEnabled() ? [{ href: JOBS_HREF, label: "Jobs" as const }] : []),
    { href: APPLICATIONS_HREF, label: "Applications" },
    { href: RESUMES_HREF, label: "Resumes" },
    { href: PROFILE_HREF, label: "Profile" },
  ];
}

export function isPrimaryNavActive(pathname: string, href: string): boolean {
  if (href === JOBS_HREF) {
    return pathname === "/app" || pathname === JOBS_HREF || pathname.startsWith(`${JOBS_HREF}/`);
  }
  if (href === SETTINGS_HREF) {
    return pathname === SETTINGS_HREF || pathname.startsWith(`${SETTINGS_HREF}/`);
  }
  if (href === RESUMES_HREF) {
    return pathname === RESUMES_HREF || pathname.startsWith(`${RESUMES_HREF}/`);
  }
  if (href === PROFILE_HREF) {
    return pathname === PROFILE_HREF || pathname.startsWith(`${PROFILE_HREF}/`);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

const BREADCRUMB_LABELS: Record<string, string> = {
  app: "Jobs",
  radar: "Jobs",
  opportunities: "Applications",
  resumes: "Resumes",
  settings: "Settings",
  profile: "Profile",
  notifications: "Notifications",
  preferences: "Preferences",
  integrations: "Integrations",
  privacy: "Privacy",
  billing: "Billing",
  new: "New",
};

export function breadcrumbLabel(segment: string): string {
  if (BREADCRUMB_LABELS[segment]) return BREADCRUMB_LABELS[segment];
  if (segment.startsWith("app-")) return "Application";
  return segment;
}
