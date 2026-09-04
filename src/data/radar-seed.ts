import type {
  JobAlert,
  MatchBreakdown,
  RadarHistoryEvent,
  RadarHomeSummary,
  RadarJob,
  RadarSearchParams,
  SavedSearch,
  SourceCoverageSummary,
} from "@/types/radar";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);
const daysAgo = (d: number) => hoursAgo(d * 24);

const linkedInDemoAttribution =
  "Demo fixture — not a live LinkedIn connection. LinkedIn access remains disabled until licensed credentials exist.";

function breakdown(overrides: Partial<MatchBreakdown> = {}): MatchBreakdown {
  return {
    overall: 78,
    skills: 82,
    evidence: 76,
    experience: 80,
    seniority: 74,
    location: 88,
    compensation: 70,
    eligibility: 90,
    careerDirection: 86,
    notes: ["Strong RAG / inference overlap with Evidence Vault stories."],
    ...overrides,
  };
}

export const radarJobs: RadarJob[] = [
  {
    id: "job-cisco-cx-ai",
    publicId: "job-cisco-cx-ai",
    title: "CX AI Software Engineer",
    company: "Cisco",
    companyMark: "CI",
    location: "United States (Remote eligible)",
    remotePolicy: "hybrid",
    employmentType: "Full-time",
    seniority: "Mid-Senior",
    department: "Customer Experience AI",
    compensation: "$165k–$210k + equity",
    technologies: ["Python", "PyTorch", "RAG", "Kubernetes", "OpenSearch", "LangGraph"],
    classification: "REPOSTED",
    verificationState: "VERIFIED_OPEN",
    companyDirect: true,
    timestampEstimated: false,
    possibleDuplicate: false,
    originalPostedAt: daysAgo(19),
    originalPostedPrecision: "EXACT_TIMESTAMP",
    sourcePostedAt: daysAgo(19),
    repostedAt: minutesAgo(42),
    firstSeenAt: daysAgo(19),
    lastVerifiedAt: minutesAgo(6),
    repostCount: 2,
    matchScore: 91,
    evidenceCoverage: 86,
    matchBreakdown: breakdown({
      overall: 91,
      skills: 94,
      evidence: 86,
      experience: 90,
      seniority: 88,
      location: 92,
      compensation: 84,
      eligibility: 95,
      careerDirection: 96,
      notes: [
        "Evidence Vault covers production RAG, evaluation, and CX-facing inference.",
        "Seniority and role family align with your Cisco target track.",
      ],
    }),
    primarySource: {
      id: "src-cisco-careers",
      name: "Cisco Careers",
      kind: "company_careers",
      companyDirect: true,
    },
    sources: [
      {
        id: "src-cisco-careers",
        name: "Cisco Careers",
        kind: "company_careers",
        companyDirect: true,
      },
      {
        id: "src-linkedin-demo",
        name: "LinkedIn (demo fixture)",
        kind: "demo_fixture",
        companyDirect: false,
        demoData: true,
        attribution: linkedInDemoAttribution,
      },
    ],
    sightings: [
      {
        id: "sight-cisco-careers",
        sourceId: "src-cisco-careers",
        sourceName: "Cisco Careers",
        url: "https://jobs.cisco.com/example/cx-ai",
        postedAt: daysAgo(19),
        firstSeenAt: daysAgo(19),
        lastSeenAt: minutesAgo(6),
      },
      {
        id: "sight-cisco-li-demo",
        sourceId: "src-linkedin-demo",
        sourceName: "LinkedIn (demo fixture)",
        url: "https://www.linkedin.com/jobs/view/demo-cisco-cx-ai",
        postedAt: minutesAgo(42),
        repostedAt: minutesAgo(42),
        firstSeenAt: minutesAgo(42),
        lastSeenAt: minutesAgo(42),
        demoData: true,
        attribution: linkedInDemoAttribution,
      },
    ],
    applicationUrl: "https://jobs.cisco.com/example/cx-ai",
    companyCareersUrl: "https://jobs.cisco.com/example/cx-ai",
    description:
      "Build AI systems that improve customer experience outcomes. Work with Python, PyTorch, retrieval systems, Kubernetes, and evaluation pipelines. Partner with CX product and platform teams.",
    responsibilities: [
      "Ship production RAG and inference services for CX workflows",
      "Own latency, quality, and evaluation loops",
      "Partner with product and platform teams on roadmap delivery",
    ],
    requirements: [
      "Production Python and ML systems experience",
      "RAG / retrieval architecture",
      "Distributed inference and evaluation",
      "Kubernetes / cloud deployment familiarity",
    ],
    preferred: ["LangGraph or agent frameworks", "OpenSearch", "SageMaker", "Customer-facing AI products"],
    hiringSignals: [
      "Active hiring on company careers",
      "Role remains open after multi-source sightings",
      "LinkedIn-shaped demo fixture shows a recent board repost",
    ],
    freshnessExplanation:
      "Employer originally posted this role about 19 days ago on Cisco Careers. CandidArc verified it still open 6 minutes ago. A LinkedIn-shaped demo fixture shows a substantially matching listing appearing again about 42 minutes ago.",
    repostExplanation:
      "Why does this say “reposted”? CandidArc found a substantially matching listing for this requisition 19 days ago. LinkedIn displayed a new posting for it 42 minutes ago (demo fixture — not a live LinkedIn connection), while the employer’s career page continued to list the position.",
    saved: true,
    linkedApplicationId: "app-cisco",
    demoData: true,
  },
  {
    id: "job-superhuman-ai",
    publicId: "job-superhuman-ai",
    title: "Senior Software Engineer, AI",
    company: "Superhuman",
    companyMark: "SH",
    location: "Remote (US)",
    remotePolicy: "remote",
    employmentType: "Full-time",
    seniority: "Senior",
    department: "AI Product",
    compensation: "$180k–$230k + equity",
    technologies: ["TypeScript", "LLM apps", "Evaluation", "Product engineering"],
    classification: "NEW",
    verificationState: "VERIFIED_OPEN",
    companyDirect: true,
    timestampEstimated: false,
    possibleDuplicate: false,
    originalPostedAt: hoursAgo(3),
    originalPostedPrecision: "EXACT_TIMESTAMP",
    sourcePostedAt: hoursAgo(3),
    firstSeenAt: minutesAgo(170),
    lastVerifiedAt: minutesAgo(25),
    repostCount: 0,
    matchScore: 84,
    evidenceCoverage: 72,
    matchBreakdown: breakdown({
      overall: 84,
      skills: 88,
      evidence: 72,
      experience: 82,
      seniority: 86,
      location: 95,
      compensation: 80,
      eligibility: 92,
      careerDirection: 88,
      notes: ["Product-minded AI work aligns with your writing and UX judgment strengths."],
    }),
    primarySource: {
      id: "src-ashby-superhuman",
      name: "Ashby",
      kind: "ats",
      companyDirect: true,
    },
    sources: [
      {
        id: "src-ashby-superhuman",
        name: "Ashby",
        kind: "ats",
        companyDirect: true,
      },
    ],
    sightings: [
      {
        id: "sight-superhuman-ashby",
        sourceId: "src-ashby-superhuman",
        sourceName: "Ashby",
        url: "https://jobs.ashbyhq.com/superhuman/demo-ai",
        postedAt: hoursAgo(3),
        firstSeenAt: minutesAgo(170),
        lastSeenAt: minutesAgo(25),
      },
    ],
    applicationUrl: "https://jobs.ashbyhq.com/superhuman/demo-ai",
    companyCareersUrl: "https://jobs.ashbyhq.com/superhuman/demo-ai",
    description:
      "Ship AI features that raise email productivity with strong product taste and technical depth.",
    responsibilities: [
      "Build LLM-powered product features end to end",
      "Design evaluation harnesses for quality and latency",
      "Collaborate closely with design and product",
    ],
    requirements: [
      "Product-minded AI engineering",
      "LLM application experience",
      "Strong writing and UX judgment",
    ],
    preferred: ["Email/productivity domain", "Evaluation frameworks"],
    hiringSignals: ["Genuinely new requisition with no prior similar listing in catalog"],
    freshnessExplanation:
      "Originally posted about 3 hours ago on Ashby. CandidArc discovered it shortly after and verified it open 25 minutes ago. No prior matching requisition was found — classified as genuinely new.",
    saved: false,
  },
  {
    id: "job-doordash-ml",
    publicId: "job-doordash-ml",
    title: "Software Engineer, ML Platform",
    company: "DoorDash",
    companyMark: "DD",
    location: "San Francisco, CA",
    remotePolicy: "hybrid",
    employmentType: "Full-time",
    seniority: "Mid-Senior",
    department: "ML Platform",
    compensation: "$170k–$220k + equity",
    technologies: ["Python", "Kubernetes", "Feature stores", "Observability", "Evaluation"],
    classification: "REFRESHED",
    verificationState: "LIKELY_OPEN",
    companyDirect: true,
    timestampEstimated: false,
    possibleDuplicate: false,
    originalPostedAt: daysAgo(11),
    originalPostedPrecision: "EXACT_TIMESTAMP",
    sourcePostedAt: daysAgo(11),
    firstSeenAt: daysAgo(11),
    lastVerifiedAt: hoursAgo(1),
    repostCount: 0,
    matchScore: 79,
    evidenceCoverage: 68,
    matchBreakdown: breakdown({
      overall: 79,
      skills: 84,
      evidence: 68,
      experience: 78,
      seniority: 80,
      location: 70,
      compensation: 78,
      eligibility: 88,
      careerDirection: 76,
      notes: ["Platform/evaluation overlap is strong; onsite hybrid preference is a mild mismatch."],
    }),
    primarySource: {
      id: "src-greenhouse-doordash",
      name: "Greenhouse",
      kind: "ats",
      companyDirect: true,
    },
    sources: [
      {
        id: "src-greenhouse-doordash",
        name: "Greenhouse",
        kind: "ats",
        companyDirect: true,
      },
    ],
    sightings: [
      {
        id: "sight-doordash-gh",
        sourceId: "src-greenhouse-doordash",
        sourceName: "Greenhouse",
        url: "https://boards.greenhouse.io/doordash/jobs/demo-ml-platform",
        postedAt: daysAgo(11),
        firstSeenAt: daysAgo(11),
        lastSeenAt: hoursAgo(1),
      },
    ],
    applicationUrl: "https://boards.greenhouse.io/doordash/jobs/demo-ml-platform",
    description:
      "Build ML platform capabilities that improve reliability, evaluation, and deployment velocity.",
    responsibilities: [
      "Improve evaluation and deployment tooling for ML teams",
      "Own reliability and observability for platform services",
    ],
    requirements: ["ML platform engineering", "Python services", "Observability and evaluation"],
    preferred: ["Feature stores", "Kubernetes"],
    hiringSignals: ["Same Greenhouse listing ID with updated description and compensation band"],
    freshnessExplanation:
      "Same source listing remains active since ~11 days ago. Description and compensation were refreshed about an hour ago — classified as refreshed, not a new requisition.",
    repostExplanation:
      "This is a refresh of an existing Greenhouse listing (same listing ID), not a board repost of a different requisition.",
    saved: false,
  },
  {
    id: "job-stripe-applied-ai",
    publicId: "job-stripe-applied-ai",
    title: "Applied AI Engineer",
    company: "Stripe",
    companyMark: "ST",
    location: "Remote (North America)",
    remotePolicy: "remote",
    employmentType: "Full-time",
    seniority: "Senior",
    compensation: "$190k–$250k + equity",
    technologies: ["Python", "LLMs", "Payments domain", "Evaluation"],
    classification: "NEW",
    verificationState: "VERIFIED_OPEN",
    companyDirect: true,
    timestampEstimated: false,
    possibleDuplicate: false,
    originalPostedAt: hoursAgo(5),
    originalPostedPrecision: "EXACT_TIMESTAMP",
    sourcePostedAt: hoursAgo(5),
    firstSeenAt: minutesAgo(270),
    lastVerifiedAt: minutesAgo(40),
    repostCount: 0,
    matchScore: 81,
    evidenceCoverage: 70,
    matchBreakdown: breakdown({ overall: 81, skills: 83, evidence: 70, careerDirection: 80 }),
    primarySource: {
      id: "src-stripe-careers",
      name: "Stripe Careers",
      kind: "company_careers",
      companyDirect: true,
    },
    sources: [
      {
        id: "src-stripe-careers",
        name: "Stripe Careers",
        kind: "company_careers",
        companyDirect: true,
      },
    ],
    sightings: [
      {
        id: "sight-stripe",
        sourceId: "src-stripe-careers",
        sourceName: "Stripe Careers",
        postedAt: hoursAgo(5),
        firstSeenAt: minutesAgo(270),
        lastSeenAt: minutesAgo(40),
      },
    ],
    applicationUrl: "https://stripe.com/jobs/listing/demo-applied-ai",
    description: "Apply LLMs to payments and risk workflows with rigorous evaluation.",
    responsibilities: ["Ship applied AI features", "Partner with risk and product teams"],
    requirements: ["Production LLM experience", "Strong systems engineering"],
    preferred: ["Payments or fintech domain"],
    hiringSignals: ["Company-direct listing with known original timestamp"],
    freshnessExplanation: "Genuinely new company-direct listing discovered about 5 hours ago.",
  },
  {
    id: "job-notion-ml",
    publicId: "job-notion-ml",
    title: "Machine Learning Engineer",
    company: "Notion",
    companyMark: "NO",
    location: "San Francisco, CA",
    remotePolicy: "hybrid",
    employmentType: "Full-time",
    seniority: "Mid",
    technologies: ["Python", "Ranking", "Embeddings", "TypeScript"],
    classification: "REOPENED",
    verificationState: "LIKELY_OPEN",
    companyDirect: true,
    timestampEstimated: true,
    possibleDuplicate: false,
    originalPostedAt: daysAgo(45),
    originalPostedPrecision: "DATE_ONLY",
    sourcePostedAt: daysAgo(2),
    firstSeenAt: daysAgo(45),
    lastVerifiedAt: hoursAgo(8),
    repostCount: 1,
    matchScore: 73,
    evidenceCoverage: 61,
    matchBreakdown: breakdown({ overall: 73, skills: 76, evidence: 61, seniority: 68 }),
    primarySource: {
      id: "src-lever-notion",
      name: "Lever",
      kind: "ats",
      companyDirect: true,
    },
    sources: [
      {
        id: "src-lever-notion",
        name: "Lever",
        kind: "ats",
        companyDirect: true,
      },
    ],
    sightings: [
      {
        id: "sight-notion",
        sourceId: "src-lever-notion",
        sourceName: "Lever",
        postedAt: daysAgo(2),
        firstSeenAt: daysAgo(45),
        lastSeenAt: hoursAgo(8),
      },
    ],
    description: "Improve ranking and retrieval quality across Notion AI surfaces.",
    responsibilities: ["Own ranking experiments", "Improve embedding pipelines"],
    requirements: ["ML engineering experience", "Python"],
    preferred: ["Search/ranking background"],
    hiringSignals: ["Previously closed requisition became active again"],
    freshnessExplanation:
      "This requisition was previously closed and became active again about 2 days ago. Original posting date is date-only (~45 days ago) so minute-level precision is not shown.",
    repostExplanation:
      "Classified as reopened: same requisition context returned after an inactive period.",
  },
  {
    id: "job-datadog-ai",
    publicId: "job-datadog-ai",
    title: "Software Engineer — AI Observability",
    company: "Datadog",
    companyMark: "DG",
    location: "New York, NY / Remote",
    remotePolicy: "hybrid",
    employmentType: "Full-time",
    seniority: "Mid-Senior",
    technologies: ["Go", "Python", "LLMs", "Observability"],
    classification: "POSSIBLE_DUPLICATE",
    verificationState: "STALE",
    companyDirect: false,
    timestampEstimated: true,
    possibleDuplicate: true,
    originalPostedAt: undefined,
    originalPostedPrecision: "UNKNOWN",
    sourcePostedAt: daysAgo(4),
    firstSeenAt: daysAgo(4),
    lastVerifiedAt: daysAgo(3),
    repostCount: 0,
    matchScore: 66,
    evidenceCoverage: 55,
    matchBreakdown: breakdown({ overall: 66, skills: 70, evidence: 55, location: 60 }),
    primarySource: {
      id: "src-linkedin-demo",
      name: "LinkedIn (demo fixture)",
      kind: "demo_fixture",
      companyDirect: false,
      demoData: true,
      attribution: linkedInDemoAttribution,
    },
    sources: [
      {
        id: "src-linkedin-demo",
        name: "LinkedIn (demo fixture)",
        kind: "demo_fixture",
        companyDirect: false,
        demoData: true,
        attribution: linkedInDemoAttribution,
      },
    ],
    sightings: [
      {
        id: "sight-datadog-li",
        sourceId: "src-linkedin-demo",
        sourceName: "LinkedIn (demo fixture)",
        postedAt: daysAgo(4),
        firstSeenAt: daysAgo(4),
        lastSeenAt: daysAgo(3),
        demoData: true,
        attribution: linkedInDemoAttribution,
      },
    ],
    description: "Build AI-assisted observability workflows (demo fixture listing).",
    responsibilities: ["Prototype AI assist features"],
    requirements: ["Backend engineering", "Interest in AI tooling"],
    preferred: ["Observability domain"],
    hiringSignals: ["Weak title/company signals only — possible duplicate of another requisition"],
    freshnessExplanation:
      "Original posting date is unknown. CandidArc first saw this LinkedIn-shaped demo fixture about 4 days ago. Verification is stale.",
    demoData: true,
  },
  {
    id: "job-anthropic-inference",
    publicId: "job-anthropic-inference",
    title: "Inference Engineer",
    company: "Anthropic",
    companyMark: "AN",
    location: "San Francisco, CA / Remote",
    remotePolicy: "remote",
    employmentType: "Full-time",
    seniority: "Senior",
    compensation: "$200k–$280k + equity",
    technologies: ["Python", "CUDA", "Distributed systems", "Inference"],
    classification: "NEW",
    verificationState: "VERIFIED_OPEN",
    companyDirect: true,
    timestampEstimated: false,
    possibleDuplicate: false,
    originalPostedAt: hoursAgo(14),
    originalPostedPrecision: "EXACT_TIMESTAMP",
    sourcePostedAt: hoursAgo(14),
    firstSeenAt: hoursAgo(13),
    lastVerifiedAt: hoursAgo(2),
    repostCount: 0,
    matchScore: 88,
    evidenceCoverage: 80,
    matchBreakdown: breakdown({
      overall: 88,
      skills: 92,
      evidence: 80,
      experience: 88,
      careerDirection: 90,
    }),
    primarySource: {
      id: "src-ashby-anthropic",
      name: "Ashby",
      kind: "ats",
      companyDirect: true,
    },
    sources: [
      {
        id: "src-ashby-anthropic",
        name: "Ashby",
        kind: "ats",
        companyDirect: true,
      },
    ],
    sightings: [
      {
        id: "sight-anthropic",
        sourceId: "src-ashby-anthropic",
        sourceName: "Ashby",
        postedAt: hoursAgo(14),
        firstSeenAt: hoursAgo(13),
        lastSeenAt: hoursAgo(2),
      },
    ],
    applicationUrl: "https://jobs.ashbyhq.com/anthropic/demo-inference",
    description: "Scale reliable inference systems for frontier models.",
    responsibilities: ["Own inference reliability and latency"],
    requirements: ["Distributed systems", "Inference or ML systems experience"],
    preferred: ["CUDA", "Performance profiling"],
    hiringSignals: ["High match on inference and evaluation experience"],
    freshnessExplanation: "Genuinely new Ashby listing discovered about 14 hours ago.",
  },
];

export const radarHistoryByJobId: Record<string, RadarHistoryEvent[]> = {
  "job-cisco-cx-ai": [
    {
      id: "he-cisco-1",
      jobId: "job-cisco-cx-ai",
      at: daysAgo(19),
      type: "discovered",
      title: "Discovered on Cisco Careers",
      detail: "Company-direct listing first seen with employer-supplied timestamp.",
      sourceName: "Cisco Careers",
    },
    {
      id: "he-cisco-2",
      jobId: "job-cisco-cx-ai",
      at: daysAgo(18),
      type: "source_sighting",
      title: "Earlier LinkedIn-shaped sighting (demo)",
      detail: linkedInDemoAttribution,
      sourceName: "LinkedIn (demo fixture)",
      demoData: true,
    },
    {
      id: "he-cisco-3",
      jobId: "job-cisco-cx-ai",
      at: minutesAgo(42),
      type: "repost_detected",
      title: "Repost detected (demo fixture)",
      detail:
        "CandidArc found a substantially matching listing for this requisition. A LinkedIn-shaped demo fixture appeared again ~42 minutes ago while Cisco Careers still listed the role.",
      sourceName: "LinkedIn (demo fixture)",
      demoData: true,
    },
    {
      id: "he-cisco-4",
      jobId: "job-cisco-cx-ai",
      at: minutesAgo(6),
      type: "verified",
      title: "Verified open on Cisco Careers",
      detail: "Company career page still accepts applications.",
      sourceName: "Cisco Careers",
    },
  ],
  "job-superhuman-ai": [
    {
      id: "he-sh-1",
      jobId: "job-superhuman-ai",
      at: hoursAgo(3),
      type: "discovered",
      title: "Discovered on Ashby",
      detail: "No prior similar requisition — classified NEW.",
      sourceName: "Ashby",
    },
    {
      id: "he-sh-2",
      jobId: "job-superhuman-ai",
      at: minutesAgo(25),
      type: "verified",
      title: "Verified open",
      detail: "Ashby board still lists the role.",
      sourceName: "Ashby",
    },
  ],
  "job-doordash-ml": [
    {
      id: "he-dd-1",
      jobId: "job-doordash-ml",
      at: daysAgo(11),
      type: "discovered",
      title: "Discovered on Greenhouse",
      detail: "Initial company-direct listing.",
      sourceName: "Greenhouse",
    },
    {
      id: "he-dd-2",
      jobId: "job-doordash-ml",
      at: hoursAgo(1),
      type: "refreshed",
      title: "Listing refreshed",
      detail: "Same listing ID; description and compensation updated.",
      sourceName: "Greenhouse",
    },
  ],
};

export const radarSavedSearches: SavedSearch[] = [
  {
    id: "ss-ai-remote",
    name: "AI engineering · remote · last 7 days",
    query: {
      q: "AI engineer",
      remote: "remote",
      freshnessPreset: "7d",
      freshnessBasis: "discovered",
      freshnessType: "new_or_reposted",
      matchScoreMin: 70,
      sort: "best_match",
    },
    createdAt: daysAgo(5),
    updatedAt: hoursAgo(12),
    alertEnabled: true,
  },
  {
    id: "ss-cisco-track",
    name: "CX / inference roles · company-direct",
    query: {
      q: "inference OR RAG OR CX AI",
      companyDirectOnly: true,
      verifiedOpenOnly: true,
      freshnessPreset: "14d",
      freshnessBasis: "originally_posted",
      sort: "company_direct_first",
    },
    createdAt: daysAgo(12),
    updatedAt: daysAgo(1),
    alertEnabled: false,
  },
];

export const radarAlerts: JobAlert[] = [
  {
    id: "alert-1",
    name: "Genuinely new AI roles (hourly)",
    savedSearchId: "ss-ai-remote",
    query: {
      q: "AI engineer",
      freshnessType: "genuinely_new",
      freshnessPreset: "24h",
      freshnessBasis: "discovered",
      matchScoreMin: 75,
    },
    cadence: "hourly",
    channels: ["in_app", "email"],
    active: true,
    lastTriggeredAt: hoursAgo(2),
    createdAt: daysAgo(4),
  },
  {
    id: "alert-2",
    name: "Reposts of strong matches",
    query: {
      freshnessType: "reposted_only",
      freshnessPreset: "48h",
      freshnessBasis: "reposted",
      matchScoreMin: 80,
    },
    cadence: "every_3h",
    channels: ["in_app"],
    active: true,
    createdAt: daysAgo(2),
  },
];

export const radarSourceCoverage: SourceCoverageSummary = {
  summary:
    "CandidArc Radar uses broad source coverage across company career sites, public ATS boards, and licensed providers when credentials exist. LinkedIn and Indeed integrations stay disabled until partnership credentials are available — demo fixtures are labeled and are not live connections.",
  items: [
    {
      id: "greenhouse",
      name: "Greenhouse Job Board API",
      category: "Public ATS",
      enabled: true,
      licenseStatus: "public_api",
      statusLabel: "Enabled",
      honestNote: "Public board endpoints only; respects published rate limits.",
      lastComplianceReview: "2026-08-15",
      rpmLimit: 30,
    },
    {
      id: "lever",
      name: "Lever Postings API",
      category: "Public ATS",
      enabled: true,
      licenseStatus: "public_api",
      statusLabel: "Enabled",
      honestNote: "Public postings API when boards allow automated access.",
      lastComplianceReview: "2026-08-15",
      rpmLimit: 30,
    },
    {
      id: "ashby",
      name: "Ashby Public Job Postings",
      category: "Public ATS",
      enabled: true,
      licenseStatus: "public_api",
      statusLabel: "Enabled",
      honestNote: "Public Ashby boards with structured job data.",
      lastComplianceReview: "2026-08-20",
      rpmLimit: 30,
    },
    {
      id: "usajobs",
      name: "USAJOBS API",
      category: "Public API",
      enabled: true,
      licenseStatus: "public_api",
      statusLabel: "Enabled (API key optional)",
      honestNote: "Uses fixtures locally when USAJOBS_API_KEY is unset.",
      lastComplianceReview: "2026-08-01",
      rpmLimit: 60,
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      category: "Licensed board",
      enabled: false,
      licenseStatus: "disabled",
      statusLabel: "Disabled — partner credentials required",
      honestNote:
        "No live LinkedIn access. Demo fixtures may appear in Radar for repost intelligence demos and are clearly labeled.",
      lastComplianceReview: "2026-09-01",
    },
    {
      id: "indeed",
      name: "Indeed",
      category: "Licensed board",
      enabled: false,
      licenseStatus: "disabled",
      statusLabel: "Disabled — partner credentials required",
      honestNote: "Indeed adapter remains disabled until licensed partner access exists.",
      lastComplianceReview: "2026-09-01",
    },
  ],
};

export function getRadarHomeSummary(jobs: RadarJob[] = radarJobs): RadarHomeSummary {
  const strong = jobs.filter((j) => j.matchScore >= 75);
  return {
    strongMatches: strong.length,
    genuinelyNew: strong.filter((j) => j.classification === "NEW").length,
    reposted: strong.filter((j) => j.classification === "REPOSTED").length,
    uncertainDates: strong.filter(
      (j) =>
        j.originalPostedPrecision === "UNKNOWN" ||
        j.originalPostedPrecision === "ESTIMATED" ||
        j.timestampEstimated,
    ).length,
    windowLabel: "last 3 hours of high-signal activity (demo catalog)",
  };
}

export function filterRadarJobs(jobs: RadarJob[], params: RadarSearchParams): RadarJob[] {
  const q = params.q?.trim().toLowerCase() ?? "";
  const location = params.location?.trim().toLowerCase() ?? "";
  let result = [...jobs];

  if (q) {
    result = result.filter((j) =>
      `${j.title} ${j.company} ${j.technologies.join(" ")} ${j.description}`
        .toLowerCase()
        .includes(q),
    );
  }
  if (location) {
    result = result.filter((j) => j.location.toLowerCase().includes(location));
  }
  if (params.company) {
    const c = params.company.toLowerCase();
    result = result.filter((j) => j.company.toLowerCase().includes(c));
  }
  if (params.excludeCompanies) {
    const excluded = params.excludeCompanies
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    result = result.filter((j) => !excluded.includes(j.company.toLowerCase()));
  }
  if (params.remote && params.remote !== "any") {
    result = result.filter((j) => j.remotePolicy === params.remote);
  }
  if (params.companyDirectOnly) {
    result = result.filter((j) => j.companyDirect);
  }
  if (params.verifiedOpenOnly) {
    result = result.filter(
      (j) => j.verificationState === "VERIFIED_OPEN" || j.verificationState === "LIKELY_OPEN",
    );
  }
  if (params.hidePossibleDuplicates) {
    result = result.filter((j) => !j.possibleDuplicate && j.classification !== "POSSIBLE_DUPLICATE");
  }
  if (params.requireKnownOriginalDate) {
    result = result.filter(
      (j) =>
        !!j.originalPostedAt &&
        j.originalPostedPrecision !== "UNKNOWN" &&
        j.originalPostedPrecision !== "ESTIMATED",
    );
  }
  if (typeof params.matchScoreMin === "number") {
    result = result.filter((j) => j.matchScore >= params.matchScoreMin!);
  }
  if (typeof params.maxRepostCount === "number") {
    result = result.filter((j) => j.repostCount <= params.maxRepostCount!);
  }
  if (typeof params.excludeOriginalOlderThanDays === "number") {
    const cutoff = Date.now() - params.excludeOriginalOlderThanDays * 86_400_000;
    result = result.filter((j) => {
      if (!j.originalPostedAt) return false;
      return new Date(j.originalPostedAt).getTime() >= cutoff;
    });
  }

  if (params.freshnessType && params.freshnessType !== "any") {
    const map: Record<string, RadarJob["classification"][]> = {
      genuinely_new: ["NEW"],
      new_or_reposted: ["NEW", "REPOSTED"],
      reposted_only: ["REPOSTED"],
      refreshed: ["REFRESHED"],
      reopened: ["REOPENED"],
    };
    const allowed = map[params.freshnessType] ?? [];
    result = result.filter((j) => allowed.includes(j.classification));
  }

  const presetMs: Record<string, number> = {
    "30m": 30 * 60_000,
    "1h": 60 * 60_000,
    "2h": 2 * 60 * 60_000,
    "3h": 3 * 60 * 60_000,
    "6h": 6 * 60 * 60_000,
    "12h": 12 * 60 * 60_000,
    "24h": 24 * 60 * 60_000,
    "48h": 48 * 60 * 60_000,
    "3d": 3 * 86_400_000,
    "7d": 7 * 86_400_000,
    "14d": 14 * 86_400_000,
    "30d": 30 * 86_400_000,
  };

  const basis = params.freshnessBasis ?? "discovered";
  const resolveTs = (j: RadarJob): number | null => {
    const iso =
      basis === "originally_posted"
        ? j.originalPostedAt
        : basis === "source_posted"
          ? j.sourcePostedAt
          : basis === "reposted"
            ? j.repostedAt
            : basis === "last_verified"
              ? j.lastVerifiedAt
              : j.firstSeenAt;
    return iso ? new Date(iso).getTime() : null;
  };

  if (params.freshnessPreset && params.freshnessPreset !== "custom") {
    const windowMs = presetMs[params.freshnessPreset];
    if (windowMs) {
      const cutoff = Date.now() - windowMs;
      result = result.filter((j) => {
        const ts = resolveTs(j);
        return ts != null && ts >= cutoff;
      });
    }
  } else if (params.freshnessPreset === "custom") {
    const start = params.customStart ? new Date(params.customStart).getTime() : null;
    const end = params.customEnd ? new Date(params.customEnd).getTime() : null;
    result = result.filter((j) => {
      const ts = resolveTs(j);
      if (ts == null) return false;
      if (start != null && ts < start) return false;
      if (end != null && ts > end) return false;
      return true;
    });
  }

  const sort = params.sort ?? "best_match";
  result.sort((a, b) => {
    switch (sort) {
      case "genuinely_newest":
        return (
          new Date(b.originalPostedAt ?? 0).getTime() - new Date(a.originalPostedAt ?? 0).getTime()
        );
      case "recently_discovered":
        return new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
      case "recently_reposted":
        return new Date(b.repostedAt ?? 0).getTime() - new Date(a.repostedAt ?? 0).getTime();
      case "recently_verified":
        return (
          new Date(b.lastVerifiedAt ?? 0).getTime() - new Date(a.lastVerifiedAt ?? 0).getTime()
        );
      case "company_direct_first":
        return Number(b.companyDirect) - Number(a.companyDirect) || b.matchScore - a.matchScore;
      case "highest_compensation":
        return b.matchScore - a.matchScore;
      case "best_match":
      default:
        return b.matchScore - a.matchScore;
    }
  });

  return result;
}

let mutableJobs = structuredClone(radarJobs);
let mutableSaved = structuredClone(radarSavedSearches);
let mutableAlerts = structuredClone(radarAlerts);
const hiddenIds = new Set<string>();
const savedIds = new Set(radarJobs.filter((j) => j.saved).map((j) => j.id));

export function getMutableRadarState() {
  return { mutableJobs, mutableSaved, mutableAlerts, hiddenIds, savedIds };
}

export function resetRadarSeedState() {
  mutableJobs = structuredClone(radarJobs);
  mutableSaved = structuredClone(radarSavedSearches);
  mutableAlerts = structuredClone(radarAlerts);
  hiddenIds.clear();
  savedIds.clear();
  for (const j of radarJobs) if (j.saved) savedIds.add(j.id);
}
