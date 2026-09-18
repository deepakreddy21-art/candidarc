export type SponsorshipStatus = "stated" | "historical" | "not_offered" | "unknown";

export type SponsorshipEvidence = {
  status: SponsorshipStatus;
  label: string;
  explanation: string;
};

export function classifySponsorship(job: {
  visaSponsorship?: boolean | null;
  historicalSponsorship?: boolean | null;
}): SponsorshipEvidence {
  if (job.visaSponsorship === true) {
    return {
      status: "stated",
      label: "Stated in this posting",
      explanation: "This posting states that sponsorship is available. That is not a visa-eligibility decision for you.",
    };
  }
  if (job.visaSponsorship === false) {
    return {
      status: "not_offered",
      label: "Not offered",
      explanation: "This posting states sponsorship is not offered.",
    };
  }
  if (job.historicalSponsorship) {
    return {
      status: "historical",
      label: "Company has historical sponsorship evidence",
      explanation: "Historical company sponsorship is not proof that this role sponsors.",
    };
  }
  return {
    status: "unknown",
    label: "Unknown",
    explanation: "Sponsorship for this posting is unknown.",
  };
}

export function matchesSponsorshipFilter(
  job: { visaSponsorship?: boolean | null; historicalSponsorship?: boolean | null },
  filter: SponsorshipStatus,
): boolean {
  return classifySponsorship(job).status === filter;
}
