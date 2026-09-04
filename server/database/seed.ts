import { hashSync } from "bcryptjs";
import type { MemoryStore } from "./memory-store";

export const DEMO_USER = {
  email: "deepak@candidarc.dev",
  password: "CandidArc!Demo1",
  publicId: "user_deepak",
  name: "Deepak Reddy Kilaru",
} as const;

export const DEMO_TENANT = {
  publicId: "ten_deepak",
  name: "Deepak Workspace",
} as const;

const scoreBreakdown = (overrides: Record<string, number> = {}) => ({
  atsCompatibility: 70,
  jobAlignment: 65,
  recruiterReadability: 68,
  impact: 62,
  quantification: 60,
  technicalDepth: 70,
  competencyCoverage: 64,
  evidenceConfidence: 72,
  writingQuality: 70,
  formatIntegrity: 80,
  ...overrides,
});

const v4Sections = [
  {
    type: "summary",
    title: "Professional Summary",
    order: 0,
    payload: {
      content:
        "AI software engineer with 5+ years shipping production inference, retrieval, and evaluation systems. Proven ownership of latency, throughput, and hallucination controls across regulated and customer-facing platforms.",
    },
  },
  {
    type: "skills",
    title: "Skills",
    order: 1,
    payload: {
      content:
        "Python · PyTorch · Hugging Face · OpenSearch · LangGraph · RAG · Kubernetes · EKS · SageMaker · Evaluation pipelines · Distributed inference",
    },
  },
  {
    type: "experience",
    title: "Experience",
    order: 2,
    payload: {
      items: [
        {
          id: "exp-usaa",
          heading: "Software Engineer, AI Platform",
          subheading: "USAA",
          location: "Remote",
          dates: "2022 — Present",
          bullets: [
            {
              id: "b-usaa-1",
              text: "Designed and operated an AI inference and search platform on Python, PyTorch, Hugging Face, OpenSearch, and EKS, cutting p95 latency 40% and raising throughput 3.5×.",
              evidenceIds: ["ev-usaa"],
              confidence: "high",
              unsupported: false,
              metricsUsed: ["40% lower latency", "3.5× throughput"],
            },
            {
              id: "b-usaa-2",
              text: "Built a LangGraph incident assistant that reduced mean investigation time from 3 hours to 45 minutes for on-call engineers.",
              evidenceIds: ["ev-langgraph"],
              confidence: "high",
              unsupported: false,
              metricsUsed: ["3h → 45m"],
            },
            {
              id: "b-usaa-3",
              text: "Owned RAG performance work that reduced response time from 2.1s to 820ms while keeping hallucinations below 2% on a 500-question evaluation set.",
              evidenceIds: ["ev-rag", "ev-eval"],
              confidence: "high",
              unsupported: false,
              metricsUsed: ["2.1s → 820ms", "<2% hallucinations", "500-question eval"],
            },
          ],
        },
        {
          id: "exp-prev",
          heading: "ML Engineer",
          subheading: "Applied AI Studio",
          location: "United States",
          dates: "2020 — 2022",
          bullets: [
            {
              id: "b-sm-1",
              text: "Fine-tuned production models on SageMaker with controlled evaluation loops, improving the target metric by 25%.",
              evidenceIds: ["ev-sagemaker"],
              confidence: "high",
              unsupported: false,
              metricsUsed: ["25% metric improvement"],
            },
          ],
        },
      ],
    },
  },
  {
    type: "projects",
    title: "Projects",
    order: 3,
    payload: {
      items: [
        {
          id: "proj-eval",
          heading: "Evaluation Framework",
          subheading: "Open-source / internal toolkit",
          dates: "2024",
          bullets: [
            {
              id: "b-eval-1",
              text: "Created a 500-question evaluation dataset and scoring harness used to gate RAG releases on latency, relevance, and hallucination rate.",
              evidenceIds: ["ev-eval"],
              confidence: "high",
              unsupported: false,
            },
          ],
        },
      ],
    },
  },
  {
    type: "education",
    title: "Education",
    order: 4,
    payload: {
      items: [
        {
          id: "edu-1",
          heading: "B.S. Computer Science",
          subheading: "University Program",
          dates: "2016 — 2020",
          bullets: [],
        },
      ],
    },
  },
];

/**
 * Seeds the Deepak Reddy Kilaru demo workspace matching Phase 1 scores
 * (V0 68 → V4 91), Cisco / Superhuman / DoorDash applications, and evidence.
 */
export function seedDemo(store: MemoryStore): {
  userId: string;
  tenantId: string;
  applicationIds: { cisco: string; superhuman: string; doordash: string };
} {
  const passwordHash = hashSync(DEMO_USER.password, 10);

  const user = store.createUser({
    id: "00000000-0000-4000-8000-000000000001",
    publicId: DEMO_USER.publicId,
    email: DEMO_USER.email,
    emailVerified: true,
    passwordHash,
    name: DEMO_USER.name,
  });

  const tenant = store.createTenant({
    id: "00000000-0000-4000-8000-000000000010",
    publicId: DEMO_TENANT.publicId,
    name: DEMO_TENANT.name,
    plan: "pro",
  });

  store.addMembership({
    id: "00000000-0000-4000-8000-000000000011",
    tenantId: tenant.id,
    userId: user.id,
    role: "owner",
  });

  const profile = store.upsertCandidateProfile({
    id: "00000000-0000-4000-8000-000000000020",
    publicId: "cand-deepak",
    tenantId: tenant.id,
    userId: user.id,
    fullName: "Deepak Reddy Kilaru",
    preferredName: "Deepak",
    email: "deepak.kilaru@email.com",
    phone: "+1 (415) 555-0142",
    location: "United States",
    linkedIn: "linkedin.com/in/deepakkilaru",
    github: "github.com/deepakkilaru",
    portfolio: "deepakkilaru.dev",
    headline: "AI Software Engineer · Inference, RAG, Evaluation",
    summary:
      "AI and software engineer with 5+ years building production inference, search, and evaluation systems across regulated and high-scale environments.",
    experienceLevel: "experienced",
    yearsExperience: 5,
    targetRoleFamilies: ["AI/ML Engineering", "Applied AI", "Backend Platform"],
    preferredResumeLength: "one-page",
    careerGoal: "CX AI Software Engineer roles focused on production RAG and inference platforms",
    avatarInitials: "DK",
  });

  const jdCisco = store.upsertJobDescription({
    id: "00000000-0000-4000-8000-000000000030",
    publicId: "jd-cisco",
    tenantId: tenant.id,
    title: "CX AI Software Engineer",
    company: "Cisco",
    location: "United States",
    employmentType: "Full-time",
    source: "Company careers",
    url: "https://jobs.cisco.com/example/cx-ai",
    deadline: "2026-09-20",
    rawText:
      "Build AI systems that improve customer experience outcomes. Work with Python, PyTorch, retrieval systems, Kubernetes, and evaluation pipelines. Partner with CX product and platform teams.",
    requirements: [
      "Production Python and ML systems experience",
      "RAG / retrieval architecture",
      "Distributed inference and evaluation",
      "Kubernetes / cloud deployment familiarity",
      "Clear ownership of latency and quality outcomes",
    ],
    preferred: ["LangGraph or agent frameworks", "OpenSearch", "SageMaker", "Customer-facing AI products"],
  });

  const jdSuperhuman = store.upsertJobDescription({
    id: "00000000-0000-4000-8000-000000000031",
    publicId: "jd-superhuman",
    tenantId: tenant.id,
    title: "Senior Software Engineer, AI",
    company: "Superhuman",
    location: "Remote",
    employmentType: "Full-time",
    source: "Ashby",
    url: null,
    deadline: "2026-09-28",
    rawText: "Ship AI features that raise email productivity with strong product taste and technical depth.",
    requirements: ["Product-minded AI engineering", "LLM application experience", "Strong writing and UX judgment"],
    preferred: ["Email/productivity domain", "Evaluation frameworks"],
  });

  const jdDoorDash = store.upsertJobDescription({
    id: "00000000-0000-4000-8000-000000000032",
    publicId: "jd-doordash",
    tenantId: tenant.id,
    title: "Software Engineer, ML Platform",
    company: "DoorDash",
    location: "San Francisco, CA",
    employmentType: "Full-time",
    source: "Greenhouse",
    url: null,
    deadline: "2026-10-05",
    rawText: "Build ML platform capabilities that improve reliability, evaluation, and deployment velocity.",
    requirements: ["ML platform engineering", "Python services", "Observability and evaluation"],
    preferred: ["Feature stores", "Kubernetes"],
  });

  const evidenceDefs = [
    {
      publicId: "ev-usaa",
      title: "USAA AI inference and search platform",
      organization: "USAA",
      situation: "Customer-facing search and inference workloads needed lower latency at higher concurrent load.",
      task: "Architect and deliver a production inference/search platform with measurable reliability and performance targets.",
      actions: [
        "Designed retrieval and inference services on Python, PyTorch, Hugging Face, and OpenSearch",
        "Deployed on EKS with autoscaling and latency-oriented routing",
        "Instrumented p95 latency and throughput SLOs",
      ],
      result: "40% lower latency and 3.5× higher throughput",
      technologies: ["Python", "PyTorch", "Hugging Face", "OpenSearch", "EKS"],
      roleRelevance: ["Distributed inference", "Search", "Production ML"],
      metrics: [
        { publicId: "m1", label: "Latency reduction", value: "40", unit: "%", verified: true },
        { publicId: "m2", label: "Throughput increase", value: "3.5", unit: "×", verified: true },
      ],
      resumeUsageHistory: ["V0", "V1", "V2", "V3", "V4"],
      tags: ["latency", "throughput", "platform"],
      supportingSource: "Internal performance report Q2",
    },
    {
      publicId: "ev-langgraph",
      title: "LangGraph incident assistant",
      organization: "USAA",
      situation: "On-call investigation required stitching logs, runbooks, and prior incidents manually.",
      task: "Prototype an agentic assistant that accelerates incident investigation without inventing unsupported steps.",
      actions: [
        "Built a LangGraph workflow over approved runbooks and telemetry summaries",
        "Added guardrails for tool use and human confirmation on remediations",
      ],
      result: "Reduced investigation time from three hours to 45 minutes",
      technologies: ["LangGraph", "Python"],
      roleRelevance: ["Agent frameworks", "Operational AI"],
      metrics: [
        {
          publicId: "m3",
          label: "Investigation time",
          value: "45",
          unit: "min",
          baseline: "180 min",
          verified: true,
        },
      ],
      resumeUsageHistory: ["V1", "V2", "V3", "V4"],
      tags: ["agents", "incidents"],
      supportingSource: null as string | null,
    },
    {
      publicId: "ev-sagemaker",
      title: "SageMaker model fine-tuning",
      organization: "Applied AI Studio",
      situation: "Baseline model underperformed on domain-specific evaluation criteria.",
      task: "Improve target evaluation metric through controlled fine-tuning and evaluation gates.",
      actions: [
        "Configured SageMaker training jobs with reproducible datasets",
        "Compared checkpoints against offline evaluation suite before promotion",
      ],
      result: "25% improvement in the relevant evaluation metric",
      technologies: ["SageMaker", "Python"],
      roleRelevance: ["Model fine-tuning", "Evaluation"],
      metrics: [{ publicId: "m4", label: "Eval metric lift", value: "25", unit: "%", verified: true }],
      resumeUsageHistory: ["V0", "V2", "V3", "V4"],
      tags: ["fine-tuning"],
      supportingSource: null as string | null,
      privacyLevel: "public" as const,
    },
    {
      publicId: "ev-rag",
      title: "RAG performance optimization",
      organization: "USAA",
      situation: "RAG responses were too slow and occasional hallucinations risked trust.",
      task: "Reduce end-to-end latency while holding hallucination rate under a strict threshold.",
      actions: [
        "Tuned retrieval depth and caching",
        "Added groundedness checks before answer finalization",
        "Measured latency and hallucination rate on a fixed eval set",
      ],
      result: "Reduced response time from 2.1 seconds to 820 milliseconds and kept hallucinations below 2%",
      technologies: ["RAG", "OpenSearch", "Python"],
      roleRelevance: ["RAG systems", "Quality controls"],
      metrics: [
        {
          publicId: "m5",
          label: "Response time",
          value: "820",
          unit: "ms",
          baseline: "2100 ms",
          verified: true,
        },
        { publicId: "m6", label: "Hallucination rate", value: "<2", unit: "%", verified: true },
      ],
      resumeUsageHistory: ["V2", "V3", "V4"],
      tags: ["rag", "latency", "hallucination"],
      supportingSource: null as string | null,
    },
    {
      publicId: "ev-eval",
      title: "Evaluation framework",
      organization: "USAA",
      situation: "Release quality depended on ad-hoc manual review.",
      task: "Create a durable evaluation dataset and harness for RAG releases.",
      actions: [
        "Curated a 500-question evaluation dataset",
        "Automated scoring for relevance, latency, and hallucination rate",
      ],
      result: "Established a 500-question evaluation gate used before production promotion",
      technologies: ["Evaluation pipelines", "Python"],
      roleRelevance: ["Evaluation pipelines"],
      metrics: [{ publicId: "m7", label: "Eval set size", value: "500", unit: "questions", verified: true }],
      resumeUsageHistory: ["V3", "V4"],
      tags: ["evaluation"],
      supportingSource: null as string | null,
    },
  ];

  for (const def of evidenceDefs) {
    const item = store.createEvidenceItem({
      publicId: def.publicId,
      tenantId: tenant.id,
      title: def.title,
      organization: def.organization,
      situation: def.situation,
      task: def.task,
      actions: def.actions,
      result: def.result,
      technologies: def.technologies,
      roleRelevance: def.roleRelevance,
      confidence: "high",
      verificationStatus: "verified",
      supportingSource: def.supportingSource,
      privacyLevel: "privacyLevel" in def && def.privacyLevel ? def.privacyLevel : "share-safe",
      resumeUsageHistory: def.resumeUsageHistory,
      interviewStoryReady: true,
      tags: def.tags,
    });
    for (const m of def.metrics) {
      store.addEvidenceMetric({
        publicId: m.publicId,
        tenantId: tenant.id,
        evidenceItemId: item.id,
        label: m.label,
        value: m.value,
        unit: m.unit,
        baseline: "baseline" in m ? (m.baseline as string) : null,
        verified: m.verified,
      });
    }
  }

  const appCisco = store.createApplication({
    id: "00000000-0000-4000-8000-000000000040",
    publicId: "app-cisco",
    tenantId: tenant.id,
    company: "Cisco",
    companyMark: "CI",
    role: "CX AI Software Engineer",
    location: "United States",
    employmentType: "Full-time",
    status: "final-qa",
    stage: "FINAL_QA_RUNNING",
    workflowStage: "FINAL_QA_RUNNING",
    resumeScore: 91,
    evidenceCoverage: 86,
    atsAlignment: 93,
    interviewStatus: "preparing",
    researchConfidence: 84,
    deadline: "2026-09-20",
    archived: false,
    roleFamily: "AI/ML Engineering",
    nextAction: "Review and export",
    jobDescriptionId: jdCisco.id,
    resumeId: null,
    ownerUserId: user.id,
    candidateProfileId: profile.id,
  });

  const appSuperhuman = store.createApplication({
    id: "00000000-0000-4000-8000-000000000041",
    publicId: "app-superhuman",
    tenantId: tenant.id,
    company: "Superhuman",
    companyMark: "SH",
    role: "Senior Software Engineer, AI",
    location: "Remote",
    employmentType: "Full-time",
    status: "auditing",
    stage: "EM_AUDIT_1_REVIEW",
    workflowStage: "EM_AUDIT_1_REVIEW",
    resumeScore: 79,
    evidenceCoverage: 72,
    atsAlignment: 81,
    interviewStatus: "not-started",
    researchConfidence: 78,
    deadline: "2026-09-28",
    archived: false,
    roleFamily: "Applied AI",
    nextAction: "Complete EM Audit 1",
    jobDescriptionId: jdSuperhuman.id,
    resumeId: null,
    ownerUserId: user.id,
    candidateProfileId: profile.id,
  });

  const appDoorDash = store.createApplication({
    id: "00000000-0000-4000-8000-000000000042",
    publicId: "app-doordash",
    tenantId: tenant.id,
    company: "DoorDash",
    companyMark: "DD",
    role: "Software Engineer, ML Platform",
    location: "San Francisco, CA",
    employmentType: "Full-time",
    status: "researching",
    stage: "RESEARCH_RUNNING",
    workflowStage: "RESEARCH_RUNNING",
    resumeScore: 0,
    evidenceCoverage: 54,
    atsAlignment: 0,
    interviewStatus: "not-started",
    researchConfidence: 41,
    deadline: "2026-10-05",
    archived: false,
    roleFamily: "Backend Platform",
    nextAction: "Finish role research",
    jobDescriptionId: jdDoorDash.id,
    resumeId: null,
    ownerUserId: user.id,
    candidateProfileId: profile.id,
  });

  // Evidence ↔ Cisco requirement matches
  const matches = [
    {
      publicId: "mx-1",
      evidencePublicId: "ev-usaa",
      requirement: "Production Python / ML systems",
      importance: "required",
      evidenceStrength: "high" as const,
      resumeUsage: "used",
    },
    {
      publicId: "mx-2",
      evidencePublicId: "ev-rag",
      requirement: "RAG / retrieval architecture",
      importance: "required",
      evidenceStrength: "high" as const,
      resumeUsage: "used",
    },
    {
      publicId: "mx-3",
      evidencePublicId: "ev-usaa",
      requirement: "Kubernetes / cloud deployment",
      importance: "required",
      evidenceStrength: "medium" as const,
      resumeUsage: "partial",
      coverageGap: "Avoid unsupported cluster-ownership claims",
    },
    {
      publicId: "mx-4",
      evidencePublicId: "ev-langgraph",
      requirement: "Agent frameworks",
      importance: "preferred",
      evidenceStrength: "high" as const,
      resumeUsage: "used",
    },
    {
      publicId: "mx-5",
      evidencePublicId: "ev-usaa",
      requirement: "Customer-facing AI product experience",
      importance: "preferred",
      evidenceStrength: "medium" as const,
      resumeUsage: "partial",
      coverageGap: "Make CX outcome language more explicit",
    },
  ];
  for (const m of matches) {
    const ev = store.getEvidenceByPublicId(m.evidencePublicId)!;
    store.matchEvidenceToApplication({
      publicId: m.publicId,
      tenantId: tenant.id,
      evidenceItemId: ev.id,
      applicationId: appCisco.id,
      requirement: m.requirement,
      importance: m.importance,
      evidenceStrength: m.evidenceStrength,
      resumeUsage: m.resumeUsage,
      coverageGap: "coverageGap" in m ? (m.coverageGap as string) : null,
      excluded: false,
    });
  }

  const researchRun = store.createResearchRun({
    publicId: "rr-cisco-1",
    tenantId: tenant.id,
    applicationId: appCisco.id,
    status: "completed",
    depth: "standard",
    confidence: 84,
    workflowRunId: null,
    promptVersion: "research-synthesis@1",
    startedAt: new Date("2026-08-18T09:30:00Z"),
    completedAt: new Date("2026-08-18T12:40:00Z"),
  });

  const sources = [
    {
      publicId: "src-jd",
      title: "Cisco CX AI Software Engineer posting",
      url: "https://jobs.cisco.com/example/cx-ai",
      type: "job-posting",
      accessedAt: new Date("2026-08-18T09:30:00Z"),
    },
    {
      publicId: "src-company",
      title: "Cisco CX AI product overview",
      url: "https://www.cisco.com/example/cx-ai",
      type: "company",
      accessedAt: new Date("2026-08-18T10:00:00Z"),
    },
    {
      publicId: "src-team",
      title: "Engineering blog: customer experience AI",
      url: "https://blogs.cisco.com/example/cx-ai",
      type: "team",
      accessedAt: new Date("2026-08-18T11:00:00Z"),
    },
    {
      publicId: "src-tech",
      title: "Public references to RAG and OpenSearch patterns",
      url: "https://example.com/rag-opensearch",
      type: "tech",
      accessedAt: new Date("2026-08-18T12:00:00Z"),
    },
  ];
  for (const s of sources) {
    store.addResearchSource({
      ...s,
      tenantId: tenant.id,
      researchRunId: researchRun.id,
      applicationId: appCisco.id,
    });
  }

  const findings = [
    {
      publicId: "rf-1",
      category: "role",
      title: "Own CX AI systems that improve customer outcomes",
      summary:
        "Role emphasizes production AI systems for CX, not pure research. Latency, quality, and customer impact are primary outcomes.",
      confidence: "high" as const,
      status: "verified" as const,
      sourceIds: ["src-jd"],
      uncertaintyNote: null as string | null,
    },
    {
      publicId: "rf-2",
      category: "team",
      title: "Likely partnership with CX product and platform teams",
      summary:
        "Public materials suggest cross-functional delivery with product and platform partners. Exact team charter is not fully public.",
      confidence: "medium" as const,
      status: "inferred" as const,
      sourceIds: ["src-team", "src-company"],
      uncertaintyNote: "Team structure is not fully documented publicly.",
    },
    {
      publicId: "rf-3",
      category: "technology",
      title: "Stack leans toward Python, retrieval, and cloud ML ops",
      summary: "Job and adjacent materials surface Python, PyTorch, retrieval systems, Kubernetes, and evaluation.",
      confidence: "high" as const,
      status: "verified" as const,
      sourceIds: ["src-jd", "src-tech"],
      uncertaintyNote: null as string | null,
    },
    {
      publicId: "rf-4",
      category: "hiring-signal",
      title: "Interview themes likely include RAG tradeoffs and ownership",
      summary: "Expect resume-defense questions on latency, evaluation, and production ownership.",
      confidence: "medium" as const,
      status: "inferred" as const,
      sourceIds: ["src-jd", "src-team"],
      uncertaintyNote: null as string | null,
    },
  ];
  for (const f of findings) {
    store.addResearchFinding({
      publicId: f.publicId,
      tenantId: tenant.id,
      researchRunId: researchRun.id,
      applicationId: appCisco.id,
      category: f.category,
      title: f.title,
      summary: f.summary,
      confidence: f.confidence,
      status: f.status,
      sourceIds: f.sourceIds,
      useInResumeStrategy: true,
      dateAccessed: new Date("2026-08-18T12:00:00Z"),
      uncertaintyNote: f.uncertaintyNote,
    });
  }

  const resume = store.createResume({
    id: "00000000-0000-4000-8000-000000000050",
    publicId: "resume-cisco",
    tenantId: tenant.id,
    applicationId: appCisco.id,
    title: "Cisco CX AI Software Engineer",
    templateId: "alumni-clean",
    length: "one-page",
    currentVersionId: null,
  });
  store.updateApplication(tenant.id, appCisco.id, { resumeId: resume.id });
  store.updateApplication(tenant.id, appSuperhuman.id, { resumeId: resume.id });
  store.updateApplication(tenant.id, appDoorDash.id, { resumeId: resume.id });

  const versionDefs = [
    {
      publicId: "rv-v0",
      versionLabel: "V0",
      versionNumber: 0,
      createdAt: new Date("2026-08-20T10:00:00Z"),
      notes: "Initial draft from research and evidence match",
      score: 68,
      scoreBreakdown: scoreBreakdown(),
      triggeredBy: "Initial generation",
    },
    {
      publicId: "rv-v1",
      versionLabel: "V1",
      versionNumber: 1,
      createdAt: new Date("2026-08-21T14:20:00Z"),
      notes: "Regenerated from 9 accepted HR Audit 1 findings",
      score: 76,
      scoreBreakdown: scoreBreakdown({
        atsCompatibility: 82,
        jobAlignment: 78,
        recruiterReadability: 80,
        impact: 70,
        quantification: 68,
      }),
      triggeredBy: "HR Audit 1",
    },
    {
      publicId: "rv-v2",
      versionLabel: "V2",
      versionNumber: 2,
      createdAt: new Date("2026-08-23T11:10:00Z"),
      notes: "Regenerated from 11 accepted EM Audit 1 findings",
      score: 83,
      scoreBreakdown: scoreBreakdown({
        atsCompatibility: 86,
        jobAlignment: 84,
        recruiterReadability: 82,
        impact: 84,
        quantification: 82,
        technicalDepth: 88,
        competencyCoverage: 85,
        evidenceConfidence: 86,
      }),
      triggeredBy: "EM Audit 1",
    },
    {
      publicId: "rv-v3",
      versionLabel: "V3",
      versionNumber: 3,
      createdAt: new Date("2026-08-25T16:40:00Z"),
      notes: "Regenerated from 8 accepted HR Audit 2 findings",
      score: 88,
      scoreBreakdown: scoreBreakdown({
        atsCompatibility: 91,
        jobAlignment: 89,
        recruiterReadability: 90,
        impact: 87,
        quantification: 86,
        technicalDepth: 89,
        competencyCoverage: 88,
        evidenceConfidence: 90,
        writingQuality: 88,
        formatIntegrity: 92,
      }),
      triggeredBy: "HR Audit 2",
    },
    {
      publicId: "rv-v4",
      versionLabel: "V4",
      versionNumber: 4,
      createdAt: new Date("2026-08-28T09:30:00Z"),
      notes: "Final version from 7 accepted EM Audit 2 findings + Final QA",
      score: 91,
      scoreBreakdown: scoreBreakdown({
        atsCompatibility: 93,
        jobAlignment: 92,
        recruiterReadability: 91,
        impact: 90,
        quantification: 89,
        technicalDepth: 93,
        competencyCoverage: 91,
        evidenceConfidence: 92,
        writingQuality: 90,
        formatIntegrity: 94,
      }),
      triggeredBy: "EM Audit 2",
    },
  ];

  for (const vd of versionDefs) {
    const version = store.appendResumeVersion({
      publicId: vd.publicId,
      tenantId: tenant.id,
      resumeId: resume.id,
      versionLabel: vd.versionLabel,
      versionNumber: vd.versionNumber,
      notes: vd.notes,
      score: vd.score,
      scoreBreakdown: vd.scoreBreakdown,
      triggeredBy: vd.triggeredBy,
      promptVersion: "resume-generation@1",
      workflowRunId: null,
    });
    // Preserve seed timestamps
    version.createdAt = vd.createdAt;
    version.updatedAt = vd.createdAt;

    const sections =
      vd.versionNumber === 0
        ? v4Sections.map((s) =>
            s.type === "summary"
              ? {
                  ...s,
                  payload: {
                    content:
                      "Experienced AI engineer passionate about machine learning, cloud systems, and delivering impactful solutions for customers.",
                  },
                }
              : s,
          )
        : v4Sections;

    for (const sec of sections) {
      store.addResumeSection({
        publicId: `${vd.publicId}-${sec.type}`,
        tenantId: tenant.id,
        resumeVersionId: version.id,
        type: sec.type,
        title: sec.title,
        order: sec.order,
        payload: structuredClone(sec.payload),
      });
    }
  }

  const auditDefs = [
    {
      publicId: "audit-hr1",
      lens: "hr-1" as const,
      label: "HR Audit 1",
      reviewsVersion: "V0",
      producesVersion: "V1",
      scoreBefore: 68,
      scoreAfter: 76,
      completedAt: new Date("2026-08-21T14:00:00Z"),
      summary: "Improved ATS keyword coverage, clarity, and career narrative. Regenerated V1 from 9 accepted findings.",
      findings: [
        {
          publicId: "f-hr1-1",
          severity: "critical" as const,
          section: "Summary",
          title: "Summary is generic and seniority-ambiguous",
          explanation: "Recruiters cannot map the candidate to CX AI ownership from the opening lines.",
          beforeText: "Experienced AI engineer passionate about machine learning...",
          suggestedText: "AI software engineer with 5+ years shipping production inference and retrieval systems...",
          expectedScoreImpact: 4,
          bulletId: "b-usaa-1",
        },
        {
          publicId: "f-hr1-2",
          severity: "major" as const,
          section: "Skills",
          title: "Missing ATS keywords from the posting",
          explanation: "Kubernetes, evaluation, and RAG language were underrepresented.",
          beforeText: "Python, ML, Cloud",
          suggestedText: "Python · PyTorch · RAG · Kubernetes · Evaluation pipelines",
          expectedScoreImpact: 3,
          bulletId: null as string | null,
        },
      ],
    },
    {
      publicId: "audit-em1",
      lens: "em-1" as const,
      label: "EM Audit 1",
      reviewsVersion: "V1",
      producesVersion: "V2",
      scoreBefore: 76,
      scoreAfter: 83,
      completedAt: new Date("2026-08-23T11:00:00Z"),
      summary: "Strengthened technical credibility, ownership, and scale. Regenerated V2 from 11 accepted findings.",
      findings: [
        {
          publicId: "f-em1-1",
          severity: "critical" as const,
          section: "Experience",
          title: "Technical depth thin on RAG tradeoffs",
          explanation: "Engineering managers will challenge how latency and hallucination controls were achieved.",
          beforeText: "Improved RAG system performance and quality.",
          suggestedText:
            "Owned RAG performance work that reduced response time from 2.1s to 820ms while keeping hallucinations below 2%...",
          expectedScoreImpact: 5,
          bulletId: "b-usaa-3",
          evidenceSource: "ev-rag",
        },
        {
          publicId: "f-em1-2",
          severity: "major" as const,
          section: "Experience",
          title: "Ownership language is generic",
          explanation: "Prefer concrete decisions and systems owned over 'worked on'.",
          beforeText: "Worked on inference and search platform.",
          suggestedText: "Designed and operated an AI inference and search platform...",
          expectedScoreImpact: 3,
          bulletId: "b-usaa-1",
        },
      ],
    },
    {
      publicId: "audit-hr2",
      lens: "hr-2" as const,
      label: "HR Audit 2",
      reviewsVersion: "V2",
      producesVersion: "V3",
      scoreBefore: 83,
      scoreAfter: 88,
      completedAt: new Date("2026-08-25T16:30:00Z"),
      summary: "Checked that technical densification did not harm readability. Regenerated V3 from 8 accepted findings.",
      findings: [
        {
          publicId: "f-hr2-1",
          severity: "major" as const,
          section: "Summary",
          title: "Summary exceeded three lines after technical rewrite",
          explanation: "HR scanability dropped when summary absorbed too many stack details.",
          beforeText: "Long multi-line technical summary...",
          suggestedText: "Keep summary under three lines; move stack specifics into Skills and Experience.",
          expectedScoreImpact: 2,
          bulletId: null as string | null,
        },
      ],
    },
    {
      publicId: "audit-em2",
      lens: "em-2" as const,
      label: "EM Audit 2",
      reviewsVersion: "V3",
      producesVersion: "V4",
      scoreBefore: 88,
      scoreAfter: 91,
      completedAt: new Date("2026-08-28T09:20:00Z"),
      summary: "Challenged weak claims and interview follow-ups. Regenerated final V4 from 7 accepted findings.",
      findings: [
        {
          publicId: "f-em2-1",
          severity: "major" as const,
          section: "Experience",
          title: "Do not imply unsupported Kubernetes ownership",
          explanation: "EKS deployment is evidenced; cluster ownership is not. Avoid interview risk.",
          beforeText: "Owned Kubernetes platform for AI workloads",
          suggestedText: "Deployed inference services on EKS with autoscaling and latency-oriented routing",
          expectedScoreImpact: 2,
          bulletId: "b-usaa-1",
        },
        {
          publicId: "f-em2-2",
          severity: "suggestion" as const,
          section: "Experience",
          title: "Prepare follow-up on evaluation gate",
          explanation: "Strong claim; ensure candidate can defend dataset construction and failure modes.",
          beforeText: "500-question evaluation dataset",
          suggestedText: "Keep metric; prepare interview story on sampling and hallucination rubric",
          expectedScoreImpact: 1,
          bulletId: null as string | null,
          evidenceSource: "ev-eval",
        },
      ],
    },
  ];

  for (const ad of auditDefs) {
    const run = store.createAuditRun({
      publicId: ad.publicId,
      tenantId: tenant.id,
      applicationId: appCisco.id,
      lens: ad.lens,
      label: ad.label,
      reviewsVersion: ad.reviewsVersion,
      producesVersion: ad.producesVersion,
      status: "completed",
      scoreBefore: ad.scoreBefore,
      scoreAfter: ad.scoreAfter,
      summary: ad.summary,
      workflowRunId: null,
      completedAt: ad.completedAt,
    });
    for (const f of ad.findings) {
      const finding = store.addAuditFinding({
        publicId: f.publicId,
        tenantId: tenant.id,
        auditRunId: run.id,
        severity: f.severity,
        status: "accepted",
        section: f.section,
        title: f.title,
        explanation: f.explanation,
        beforeText: f.beforeText,
        suggestedText: f.suggestedText,
        evidenceSource: "evidenceSource" in f ? (f.evidenceSource as string) : null,
        expectedScoreImpact: f.expectedScoreImpact,
        bulletId: f.bulletId,
      });
      store.recordAuditDecision({
        publicId: `dec-${f.publicId}`,
        tenantId: tenant.id,
        auditFindingId: finding.id,
        userId: user.id,
        status: "accepted",
        editedText: null,
        reason: null,
      });
    }
  }

  const mistakeRules = [
    {
      publicId: "mm-1",
      originatingAudit: "em-1" as const,
      affectedVersion: "V1",
      rule: "Avoid generic ownership language",
      appliedIn: ["V2", "V3", "V4"],
    },
    {
      publicId: "mm-2",
      originatingAudit: "hr-2" as const,
      affectedVersion: "V2",
      rule: "Keep the summary below three lines",
      appliedIn: ["V3", "V4"],
    },
    {
      publicId: "mm-3",
      originatingAudit: "em-2" as const,
      affectedVersion: "V3",
      rule: "Do not add unsupported Kubernetes ownership",
      appliedIn: ["V4"],
    },
    {
      publicId: "mm-4",
      originatingAudit: "em-1" as const,
      affectedVersion: "V1",
      rule: "Do not repeat the same latency metric across unrelated bullets",
      appliedIn: ["V2", "V3", "V4"],
    },
    {
      publicId: "mm-5",
      originatingAudit: "hr-1" as const,
      affectedVersion: "V0",
      rule: "Avoid reintroducing previously removed buzzwords",
      appliedIn: ["V1", "V2", "V3", "V4"],
    },
    {
      publicId: "mm-6",
      originatingAudit: "em-2" as const,
      affectedVersion: "V3",
      rule: "Use OpenSearch only where evidence supports it",
      appliedIn: ["V4"],
    },
    {
      publicId: "mm-7",
      originatingAudit: "em-1" as const,
      affectedVersion: "V1",
      rule: "Preserve the strongest scale indicator",
      appliedIn: ["V2", "V3", "V4"],
    },
  ];
  for (const r of mistakeRules) {
    store.addMistakeMemoryRule({
      publicId: r.publicId,
      tenantId: tenant.id,
      applicationId: appCisco.id,
      originatingAudit: r.originatingAudit,
      affectedVersion: r.affectedVersion,
      category: "writing",
      rule: r.rule,
      severity: "major",
      status: "active",
      userOverride: false,
      appliedIn: r.appliedIn,
    });
  }

  const v4 = store.getResumeVersion(tenant.id, "rv-v4")!;
  const qaRun = store.createFinalQaRun({
    publicId: "fqa-cisco-1",
    tenantId: tenant.id,
    applicationId: appCisco.id,
    resumeVersionId: v4.id,
    status: "completed",
    passed: true,
    completedAt: new Date("2026-08-28T09:40:00Z"),
  });

  const qaChecks = [
    { publicId: "qa-1", label: "ATS parsing passed", status: "pass", detail: "Standard section headings and plain-text bullets parse cleanly." },
    { publicId: "qa-2", label: "Contact information present", status: "pass", detail: "Name, email, phone, and links present." },
    { publicId: "qa-3", label: "Dates consistent", status: "pass", detail: "No overlapping or inverted date ranges." },
    { publicId: "qa-4", label: "No unsupported claims", status: "pass", detail: "All metrics linked to verified evidence." },
    { publicId: "qa-5", label: "No unresolved critical findings", status: "pass", detail: "Critical audit findings accepted or resolved." },
    { publicId: "qa-6", label: "No page overflow", status: "pass", detail: "One-page preference satisfied at default zoom." },
    { publicId: "qa-9", label: "Links valid", status: "warning", detail: "Portfolio URL should be re-checked before public share." },
    { publicId: "qa-12", label: "Job alignment threshold reached", status: "pass", detail: "Alignment score 92 ≥ 85 threshold." },
    { publicId: "qa-13", label: "Evidence coverage acceptable", status: "pass", detail: "Coverage 86% ≥ 80% threshold." },
  ];
  for (const c of qaChecks) {
    store.addFinalQaCheck({
      ...c,
      tenantId: tenant.id,
      finalQaRunId: qaRun.id,
    });
  }

  const interview = store.createInterviewSession({
    publicId: "int-1",
    tenantId: tenant.id,
    applicationId: appCisco.id,
    mode: "resume-defense",
    status: "ended",
    difficulty: "medium",
    durationMinutes: 30,
    interviewerPersona: "Engineering manager",
    voiceMode: false,
    resumeVersionId: v4.id,
    currentQuestionIndex: 2,
    readinessScore: 82,
    startedAt: new Date("2026-08-29T15:00:00Z"),
    endedAt: new Date("2026-08-29T15:28:00Z"),
  });

  const questions = [
    {
      publicId: "q1",
      prompt:
        "Walk me through how you designed and evaluated the RAG system that reduced latency from 2.1 seconds to 820 milliseconds.",
      type: "resume-defense",
      competency: "RAG systems",
      evidenceCueIds: ["ev-rag", "ev-eval"],
      hint: "Cover retrieval design, measurement method, hallucination controls, and tradeoffs.",
      followUp: "What would you change if recall dropped after the latency win?",
      order: 0,
    },
    {
      publicId: "q2",
      prompt: "How did you decide which incident assistant actions required human confirmation?",
      type: "technical",
      competency: "Agent frameworks",
      evidenceCueIds: ["ev-langgraph"],
      hint: "Discuss risk, tool permissions, and operational trust.",
      followUp: null as string | null,
      order: 1,
    },
    {
      publicId: "q3",
      prompt: "Tell me about a time you owned a production latency regression end to end.",
      type: "behavioral",
      competency: "Ownership",
      evidenceCueIds: ["ev-usaa"],
      hint: null as string | null,
      followUp: null as string | null,
      order: 2,
    },
  ];
  for (const q of questions) {
    store.addInterviewQuestion({
      ...q,
      tenantId: tenant.id,
      sessionId: interview.id,
    });
  }

  store.addInterviewResponse({
    publicId: "resp-1",
    tenantId: tenant.id,
    sessionId: interview.id,
    questionId: null,
    role: "interviewer",
    text: questions[0].prompt,
    at: new Date("2026-08-29T15:01:00Z"),
  });
  store.addInterviewResponse({
    publicId: "resp-2",
    tenantId: tenant.id,
    sessionId: interview.id,
    questionId: null,
    role: "candidate",
    text: "I started from the measurement plan: fixed 500-question eval, p95 latency, and hallucination rate under 2%. Then I tuned retrieval depth and caching...",
    at: new Date("2026-08-29T15:03:00Z"),
  });

  store.setInterviewFeedback({
    publicId: "ifb-1",
    tenantId: tenant.id,
    sessionId: interview.id,
    overall: 82,
    structure: 84,
    relevance: 88,
    technicalDepth: 86,
    evidenceUsage: 90,
    concision: 74,
    clarity: 80,
    pacing: 78,
    fillerTrend: "improving",
    strongestAnswer: "RAG latency and hallucination control walkthrough",
    weakestAnswer: "Could tighten opening structure on ownership story",
    missedEvidence: ["SageMaker fine-tuning metric as secondary proof of evaluation discipline"],
    followUpRisk: "Be ready to defend OpenSearch usage boundaries",
    practicePlan: [
      "Rehearse 90-second STAR opener for ownership stories",
      "Drill tradeoff follow-ups on recall vs latency",
      "Practice concise closing ask",
    ],
  });

  const wf = store.createWorkflowRun({
    publicId: "wf-cisco-final-qa",
    tenantId: tenant.id,
    applicationId: appCisco.id,
    stage: "FINAL_QA_RUNNING",
    status: "waiting_review",
    idempotencyKey: `tenant:${tenant.id}:app:${appCisco.id}:FINAL_QA_RUNNING`,
    inputVersion: "V4",
    outputVersion: null,
    provider: "mock",
    model: "mock-resume-v1",
    promptVersion: "final-qa@1",
    tokenUsage: { input: 4200, output: 900, total: 5100 },
    estimatedCostCents: "12.5000",
    errorClass: null,
    retryStatus: null,
    traceId: "tr_demo_cisco_final",
    startedAt: new Date("2026-08-28T09:30:00Z"),
    completedAt: null,
    payload: { demo: true },
  });

  store.appendWorkflowEvent({
    publicId: "wevt_0001",
    workflowRunId: wf.id,
    tenantId: tenant.id,
    applicationId: appCisco.id,
    stage: "V4_READY",
    status: "completed",
    message: "Final V4 generated with score 91",
    seq: 1,
    metadata: { score: 91 },
  });
  store.appendWorkflowEvent({
    publicId: "wevt_0002",
    workflowRunId: wf.id,
    tenantId: tenant.id,
    applicationId: appCisco.id,
    stage: "FINAL_QA_RUNNING",
    status: "waiting_review",
    message: "Cisco resume ready for Final QA",
    seq: 2,
    metadata: {},
  });

  store.appendUsage({
    publicId: "usage_demo_1",
    tenantId: tenant.id,
    userId: user.id,
    kind: "resume_generation",
    units: "5",
    costCents: "45.0000",
    workflowRunId: wf.id,
    idempotencyKey: `usage:demo:resume:${appCisco.id}`,
    metadata: { versions: ["V0", "V1", "V2", "V3", "V4"] },
  });

  store.addNotification({
    publicId: "n1",
    tenantId: tenant.id,
    userId: user.id,
    title: "Cisco resume ready for Final QA",
    body: "Your Cisco resume has completed its final engineering review.",
    href: "/app/opportunities/app-cisco/resume",
    tone: "success",
    read: false,
  });
  store.addNotification({
    publicId: "n3",
    tenantId: tenant.id,
    userId: user.id,
    title: "DoorDash research still open",
    body: "Finish role research to unlock evidence matching.",
    href: "/app/opportunities/app-doordash/research",
    tone: "warning",
    read: true,
  });

  store.registerStoredFile({
    publicId: "file-cisco-export",
    tenantId: tenant.id,
    ownerUserId: user.id,
    purpose: "resume_export",
    storageKey: `${tenant.publicId}/exports/app-cisco/rv-v4.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 84_200,
    checksum: "sha256:demo",
    scanStatus: "clean",
    retentionState: "active",
    originalFilename: "Deepak_Kilaru_Cisco_CX_AI.pdf",
  });

  store.appendAuditLog({
    publicId: "alog_seed",
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "seed.demo",
    resourceType: "tenant",
    resourceId: tenant.publicId,
    requestId: "req_seed_demo",
    metadata: { applications: ["app-cisco", "app-superhuman", "app-doordash"] },
  });

  return {
    userId: user.id,
    tenantId: tenant.id,
    applicationIds: {
      cisco: appCisco.id,
      superhuman: appSuperhuman.id,
      doordash: appDoorDash.id,
    },
  };
}

/** Ensure demo data exists once in the process-wide memory store. */
export function ensureDemoSeeded(store: MemoryStore): ReturnType<typeof seedDemo> {
  const existing = store.findUserByEmail(DEMO_USER.email);
  if (existing) {
    const tenant = store.findTenantByPublicId(DEMO_TENANT.publicId)!;
    const cisco = store.getApplicationByPublicId("app-cisco")!;
    const superhuman = store.getApplicationByPublicId("app-superhuman")!;
    const doordash = store.getApplicationByPublicId("app-doordash")!;
    return {
      userId: existing.id,
      tenantId: tenant.id,
      applicationIds: {
        cisco: cisco.id,
        superhuman: superhuman.id,
        doordash: doordash.id,
      },
    };
  }
  return seedDemo(store);
}
