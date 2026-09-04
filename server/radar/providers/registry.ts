import type { JobSourceProvider } from "./types";
import { greenhouseProvider } from "./greenhouse";
import { leverProvider } from "./lever";
import { ashbyProvider } from "./ashby";
import { usaJobsProvider } from "./usajobs";
import { linkedInLicensedProvider } from "./linkedin-licensed";
import { indeedPartnerProvider } from "./indeed-partner";

const PROVIDERS: JobSourceProvider[] = [
  greenhouseProvider,
  leverProvider,
  ashbyProvider,
  usaJobsProvider,
  linkedInLicensedProvider,
  indeedPartnerProvider,
];

export function listProviders(): JobSourceProvider[] {
  return [...PROVIDERS];
}

export function getProvider(id: string): JobSourceProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function getEnabledProviders(): JobSourceProvider[] {
  return PROVIDERS.filter((p) => p.enabled && p.policy.enabled);
}

export {
  greenhouseProvider,
  leverProvider,
  ashbyProvider,
  usaJobsProvider,
  linkedInLicensedProvider,
  indeedPartnerProvider,
};
