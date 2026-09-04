import type {
  ApplicationRecord,
  AuditFindingRecord,
  AuditRunRecord,
  EvidenceRecord,
  MemoryStoreLike,
  ResearchRunRecord,
  ResumeRecord,
  ResumeVersionRecord,
} from "./repositories";
import { newId, nowIso } from "./repositories";
import type { WorkflowStage } from "../domain/types";

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

export type MistakeMemorySeed = {
  id: string;
  applicationId: string;
  originatingAudit: string;
  affectedVersion: string;
  rule: string;
  status: string;
  appliedIn: string[];
  userOverride?: boolean;
};

/**
 * Extra demo-only collections hung off the memory store for Phase 1 parity.
 */
export type DemoExtras = {
  mistakeMemory: MistakeMemorySeed[];
};

const DEMO_EXTRAS_KEY = "__demoExtras" as const;

export function getDemoExtras(store: MemoryStoreLike): DemoExtras {
  const anyStore = store as MemoryStoreLike & { [DEMO_EXTRAS_KEY]?: DemoExtras };
  if (!anyStore[DEMO_EXTRAS_KEY]) {
    anyStore[DEMO_EXTRAS_KEY] = { mistakeMemory: [] };
  }
  return anyStore[DEMO_EXTRAS_KEY]!;
}

/**
 * Populate Cisco / Superhuman / DoorDash demo applications into MemoryRepositories store
 * after ensureDemoUser. Keeps Phase 1 public IDs (`app-cisco`, etc.).
 */
export function seedDemoAppsIntoMemory(
  store: MemoryStoreLike,
  opts: { tenantId: string; userId: string },
): void {
  if ([...store.applications.values()].some((a) => !a.deletedAt)) {
    return;
  }

  const { tenantId, userId } = opts;
  const ts = nowIso();

  const apps: Array<Omit<ApplicationRecord, "version" | "deletedAt"> & { version?: number }> = [
    {
      id: "00000000-0000-4000-8000-000000000040",
      publicId: "app-cisco",
      tenantId,
      company: "Cisco",
      companyMark: "CI",
      role: "CX AI Software Engineer",
      location: "United States",
      employmentType: "Full-time",
      status: "final-qa",
      stage: "FINAL_QA_RUNNING" as WorkflowStage,
      workflowStage: "FINAL_QA_RUNNING" as WorkflowStage,
      resumeScore: 91,
      evidenceCoverage: 86,
      atsAlignment: 93,
      interviewStatus: "preparing",
      researchConfidence: 84,
      deadline: "2026-09-20",
      archived: false,
      roleFamily: "AI/ML Engineering",
      nextAction: "Review and export",
      jobDescriptionPublicId: "jd-cisco",
      resumePublicId: "resume-cisco",
      ownerUserId: userId,
      createdAt: "2026-08-18T09:00:00Z",
      updatedAt: "2026-08-28T10:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000041",
      publicId: "app-superhuman",
      tenantId,
      company: "Superhuman",
      companyMark: "SH",
      role: "Senior Software Engineer, AI",
      location: "Remote",
      employmentType: "Full-time",
      status: "auditing",
      stage: "EM_AUDIT_1_REVIEW" as WorkflowStage,
      workflowStage: "EM_AUDIT_1_REVIEW" as WorkflowStage,
      resumeScore: 79,
      evidenceCoverage: 72,
      atsAlignment: 81,
      interviewStatus: "not-started",
      researchConfidence: 78,
      deadline: "2026-09-28",
      archived: false,
      roleFamily: "Applied AI",
      nextAction: "Complete EM Audit 1",
      jobDescriptionPublicId: "jd-superhuman",
      resumePublicId: "resume-cisco",
      ownerUserId: userId,
      createdAt: "2026-08-22T12:00:00Z",
      updatedAt: "2026-08-27T18:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000042",
      publicId: "app-doordash",
      tenantId,
      company: "DoorDash",
      companyMark: "DD",
      role: "Software Engineer, ML Platform",
      location: "San Francisco, CA",
      employmentType: "Full-time",
      status: "researching",
      stage: "RESEARCH_RUNNING" as WorkflowStage,
      workflowStage: "RESEARCH_RUNNING" as WorkflowStage,
      resumeScore: 0,
      evidenceCoverage: 54,
      atsAlignment: 0,
      interviewStatus: "not-started",
      researchConfidence: 41,
      deadline: "2026-10-05",
      archived: false,
      roleFamily: "Backend Platform",
      nextAction: "Finish role research",
      jobDescriptionPublicId: "jd-doordash",
      resumePublicId: "resume-cisco",
      ownerUserId: userId,
      createdAt: "2026-08-25T08:00:00Z",
      updatedAt: "2026-08-26T14:00:00Z",
    },
  ];

  for (const app of apps) {
    store.applications.set(app.id, {
      ...app,
      version: 1,
      deletedAt: null,
    });
  }

  const evidenceDefs: Array<{
    publicId: string;
    title: string;
    organization: string;
    situation: string;
    task: string;
    actions: string[];
    result: string;
    technologies: string[];
    privacyLevel?: string;
    payload: Record<string, unknown>;
  }> = [
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
      payload: {
        metrics: [
          { id: "m1", label: "Latency reduction", value: "40", unit: "%", verified: true },
          { id: "m2", label: "Throughput increase", value: "3.5", unit: "×", verified: true },
        ],
        roleRelevance: ["Distributed inference", "Search", "Production ML"],
        resumeUsageHistory: ["V0", "V1", "V2", "V3", "V4"],
        tags: ["latency", "throughput", "platform"],
        interviewStoryReady: true,
        supportingSource: "Internal performance report Q2",
      },
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
      payload: {
        metrics: [
          { id: "m3", label: "Investigation time", value: "45", unit: "min", baseline: "180 min", verified: true },
        ],
        roleRelevance: ["Agent frameworks", "Operational AI"],
        resumeUsageHistory: ["V1", "V2", "V3", "V4"],
        tags: ["agents", "incidents"],
        interviewStoryReady: true,
      },
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
      privacyLevel: "public",
      payload: {
        metrics: [{ id: "m4", label: "Eval metric lift", value: "25", unit: "%", verified: true }],
        roleRelevance: ["Model fine-tuning", "Evaluation"],
        resumeUsageHistory: ["V0", "V2", "V3", "V4"],
        tags: ["fine-tuning"],
        interviewStoryReady: true,
      },
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
      payload: {
        metrics: [
          { id: "m5", label: "Response time", value: "820", unit: "ms", baseline: "2100 ms", verified: true },
          { id: "m6", label: "Hallucination rate", value: "<2", unit: "%", verified: true },
        ],
        roleRelevance: ["RAG systems", "Quality controls"],
        resumeUsageHistory: ["V2", "V3", "V4"],
        tags: ["rag", "latency", "hallucination"],
        interviewStoryReady: true,
      },
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
      payload: {
        metrics: [{ id: "m7", label: "Eval set size", value: "500", unit: "questions", verified: true }],
        roleRelevance: ["Evaluation pipelines"],
        resumeUsageHistory: ["V3", "V4"],
        tags: ["evaluation"],
        interviewStoryReady: true,
      },
    },
  ];

  for (const def of evidenceDefs) {
    const record: EvidenceRecord = {
      id: newId("ev"),
      publicId: def.publicId,
      tenantId,
      title: def.title,
      organization: def.organization,
      situation: def.situation,
      task: def.task,
      actions: def.actions,
      result: def.result,
      technologies: def.technologies,
      confidence: "high",
      verificationStatus: "verified",
      privacyLevel: def.privacyLevel ?? "share-safe",
      excludedFromApplicationIds: [],
      matchedApplicationIds: ["app-cisco"],
      payload: def.payload,
      version: 1,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
    };
    store.evidence.set(record.id, record);
  }

  const resume: ResumeRecord = {
    id: "00000000-0000-4000-8000-000000000050",
    publicId: "resume-cisco",
    tenantId,
    applicationId: "00000000-0000-4000-8000-000000000040",
    applicationPublicId: "app-cisco",
    title: "Cisco CX AI Software Engineer",
    templateId: "alumni-clean",
    length: "one-page",
    currentVersionPublicId: "rv-v4",
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-08-28T09:30:00Z",
    deletedAt: null,
  };
  store.resumes.set(resume.id, resume);

  const versionDefs = [
    {
      publicId: "rv-v0",
      versionLabel: "V0",
      versionNumber: 0,
      createdAt: "2026-08-20T10:00:00Z",
      notes: "Initial draft from research and evidence match",
      score: 68,
      scoreBreakdown: scoreBreakdown(),
      triggeredBy: "Initial generation",
    },
    {
      publicId: "rv-v1",
      versionLabel: "V1",
      versionNumber: 1,
      createdAt: "2026-08-21T14:20:00Z",
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
      createdAt: "2026-08-23T11:10:00Z",
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
      createdAt: "2026-08-25T16:40:00Z",
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
      createdAt: "2026-08-28T09:30:00Z",
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
    const record: ResumeVersionRecord = {
      id: newId("rv"),
      publicId: vd.publicId,
      tenantId,
      resumeId: resume.id,
      versionNumber: vd.versionNumber,
      versionLabel: vd.versionLabel,
      score: vd.score,
      scoreBreakdown: vd.scoreBreakdown,
      notes: vd.notes,
      triggeredBy: vd.triggeredBy,
      sections: [],
      idempotencyKey: `seed:${vd.publicId}`,
      promptVersion: "resume-generation@1",
      createdAt: vd.createdAt,
    };
    store.resumeVersions.set(record.id, record);
  }

  const research: ResearchRunRecord = {
    id: newId("rr"),
    publicId: "rr-cisco-1",
    tenantId,
    applicationId: "00000000-0000-4000-8000-000000000040",
    applicationPublicId: "app-cisco",
    status: "completed",
    depth: "standard",
    confidence: 84,
    findings: [
      {
        id: "rf-1",
        applicationId: "app-cisco",
        category: "role",
        title: "Own CX AI systems that improve customer outcomes",
        summary:
          "Role emphasizes production AI systems for CX, not pure research. Latency, quality, and customer impact are primary outcomes.",
        confidence: "high",
        status: "verified",
        sourceIds: ["src-jd"],
        useInResumeStrategy: true,
        dateAccessed: "2026-08-18T09:30:00Z",
      },
      {
        id: "rf-2",
        applicationId: "app-cisco",
        category: "team",
        title: "Likely partnership with CX product and platform teams",
        summary:
          "Public materials suggest cross-functional delivery with product and platform partners. Exact team charter is not fully public.",
        confidence: "medium",
        status: "inferred",
        sourceIds: ["src-team", "src-company"],
        useInResumeStrategy: true,
        dateAccessed: "2026-08-18T11:00:00Z",
        uncertaintyNote: "Team structure is not fully documented publicly.",
      },
      {
        id: "rf-3",
        applicationId: "app-cisco",
        category: "technology",
        title: "Stack leans toward Python, retrieval, and cloud ML ops",
        summary: "Job and adjacent materials surface Python, PyTorch, retrieval systems, Kubernetes, and evaluation.",
        confidence: "high",
        status: "verified",
        sourceIds: ["src-jd", "src-tech"],
        useInResumeStrategy: true,
        dateAccessed: "2026-08-18T12:00:00Z",
      },
      {
        id: "rf-4",
        applicationId: "app-cisco",
        category: "hiring-signal",
        title: "Interview themes likely include RAG tradeoffs and ownership",
        summary: "Expect resume-defense questions on latency, evaluation, and production ownership.",
        confidence: "medium",
        status: "inferred",
        sourceIds: ["src-jd", "src-team"],
        useInResumeStrategy: true,
        dateAccessed: "2026-08-18T12:30:00Z",
      },
    ],
    sources: [
      {
        id: "src-jd",
        title: "Cisco CX AI Software Engineer posting",
        url: "https://jobs.cisco.com/example/cx-ai",
        accessedAt: "2026-08-18T09:30:00Z",
        type: "job-posting",
      },
      {
        id: "src-company",
        title: "Cisco CX AI product overview",
        url: "https://www.cisco.com/example/cx-ai",
        accessedAt: "2026-08-18T10:00:00Z",
        type: "company",
      },
      {
        id: "src-team",
        title: "Engineering blog: customer experience AI",
        url: "https://blogs.cisco.com/example/cx-ai",
        accessedAt: "2026-08-18T11:00:00Z",
        type: "team",
      },
      {
        id: "src-tech",
        title: "Public references to RAG and OpenSearch patterns",
        url: "https://example.com/rag-opensearch",
        accessedAt: "2026-08-18T12:00:00Z",
        type: "tech",
      },
    ],
    createdAt: "2026-08-18T09:30:00Z",
    updatedAt: "2026-08-18T12:40:00Z",
    completedAt: "2026-08-18T12:40:00Z",
  };
  store.researchRuns.set(research.id, research);

  const auditDefs: Array<{
    run: Omit<AuditRunRecord, "createdAt" | "updatedAt"> & { createdAt?: string };
    findings: Array<Omit<AuditFindingRecord, "id"> & { id?: string }>;
  }> = [
    {
      run: {
        id: newId("ar"),
        publicId: "audit-hr1",
        tenantId,
        applicationId: "00000000-0000-4000-8000-000000000040",
        applicationPublicId: "app-cisco",
        lens: "hr-1",
        label: "HR Audit 1",
        reviewsVersion: "V0",
        producesVersion: "V1",
        status: "completed",
        scoreBefore: 68,
        scoreAfter: 76,
        summary: "Improved ATS keyword coverage, clarity, and career narrative. Regenerated V1 from 9 accepted findings.",
        completedAt: "2026-08-21T14:00:00Z",
      },
      findings: [
        {
          publicId: "f-hr1-1",
          tenantId,
          auditRunId: "",
          auditRunPublicId: "audit-hr1",
          severity: "critical",
          status: "accepted",
          section: "Summary",
          title: "Summary is generic and seniority-ambiguous",
          explanation: "Recruiters cannot map the candidate to CX AI ownership from the opening lines.",
          beforeText: "Experienced AI engineer passionate about machine learning...",
          suggestedText: "AI software engineer with 5+ years shipping production inference and retrieval systems...",
          expectedScoreImpact: 4,
        },
        {
          publicId: "f-hr1-2",
          tenantId,
          auditRunId: "",
          auditRunPublicId: "audit-hr1",
          severity: "major",
          status: "accepted",
          section: "Skills",
          title: "Missing ATS keywords from the posting",
          explanation: "Kubernetes, evaluation, and RAG language were underrepresented.",
          beforeText: "Python, ML, Cloud",
          suggestedText: "Python · PyTorch · RAG · Kubernetes · Evaluation pipelines",
          expectedScoreImpact: 3,
        },
      ],
    },
    {
      run: {
        id: newId("ar"),
        publicId: "audit-em1",
        tenantId,
        applicationId: "00000000-0000-4000-8000-000000000040",
        applicationPublicId: "app-cisco",
        lens: "em-1",
        label: "EM Audit 1",
        reviewsVersion: "V1",
        producesVersion: "V2",
        status: "completed",
        scoreBefore: 76,
        scoreAfter: 83,
        summary: "Strengthened technical credibility, ownership, and scale. Regenerated V2 from 11 accepted findings.",
        completedAt: "2026-08-23T11:00:00Z",
      },
      findings: [
        {
          publicId: "f-em1-1",
          tenantId,
          auditRunId: "",
          auditRunPublicId: "audit-em1",
          severity: "critical",
          status: "accepted",
          section: "Experience",
          title: "Technical depth thin on RAG tradeoffs",
          explanation: "Engineering managers will challenge how latency and hallucination controls were achieved.",
          beforeText: "Improved RAG system performance and quality.",
          suggestedText:
            "Owned RAG performance work that reduced response time from 2.1s to 820ms while keeping hallucinations below 2%...",
          evidenceSource: "ev-rag",
          expectedScoreImpact: 5,
        },
        {
          publicId: "f-em1-2",
          tenantId,
          auditRunId: "",
          auditRunPublicId: "audit-em1",
          severity: "major",
          status: "accepted",
          section: "Experience",
          title: "Ownership language is generic",
          explanation: "Prefer concrete decisions and systems owned over 'worked on'.",
          beforeText: "Worked on inference and search platform.",
          suggestedText: "Designed and operated an AI inference and search platform...",
          expectedScoreImpact: 3,
        },
      ],
    },
    {
      run: {
        id: newId("ar"),
        publicId: "audit-hr2",
        tenantId,
        applicationId: "00000000-0000-4000-8000-000000000040",
        applicationPublicId: "app-cisco",
        lens: "hr-2",
        label: "HR Audit 2",
        reviewsVersion: "V2",
        producesVersion: "V3",
        status: "completed",
        scoreBefore: 83,
        scoreAfter: 88,
        summary: "Checked that technical densification did not harm readability. Regenerated V3 from 8 accepted findings.",
        completedAt: "2026-08-25T16:30:00Z",
      },
      findings: [
        {
          publicId: "f-hr2-1",
          tenantId,
          auditRunId: "",
          auditRunPublicId: "audit-hr2",
          severity: "major",
          status: "accepted",
          section: "Summary",
          title: "Summary exceeded three lines after technical rewrite",
          explanation: "HR scanability dropped when summary absorbed too many stack details.",
          beforeText: "Long multi-line technical summary...",
          suggestedText: "Keep summary under three lines; move stack specifics into Skills and Experience.",
          expectedScoreImpact: 2,
        },
      ],
    },
    {
      run: {
        id: newId("ar"),
        publicId: "audit-em2",
        tenantId,
        applicationId: "00000000-0000-4000-8000-000000000040",
        applicationPublicId: "app-cisco",
        lens: "em-2",
        label: "EM Audit 2",
        reviewsVersion: "V3",
        producesVersion: "V4",
        status: "completed",
        scoreBefore: 88,
        scoreAfter: 91,
        summary: "Challenged weak claims and interview follow-ups. Regenerated final V4 from 7 accepted findings.",
        completedAt: "2026-08-28T09:20:00Z",
      },
      findings: [
        {
          publicId: "f-em2-1",
          tenantId,
          auditRunId: "",
          auditRunPublicId: "audit-em2",
          severity: "major",
          status: "accepted",
          section: "Experience",
          title: "Do not imply unsupported Kubernetes ownership",
          explanation: "EKS deployment is evidenced; cluster ownership is not. Avoid interview risk.",
          beforeText: "Owned Kubernetes platform for AI workloads",
          suggestedText: "Deployed inference services on EKS with autoscaling and latency-oriented routing",
          expectedScoreImpact: 2,
        },
        {
          publicId: "f-em2-2",
          tenantId,
          auditRunId: "",
          auditRunPublicId: "audit-em2",
          severity: "suggestion",
          status: "accepted",
          section: "Experience",
          title: "Prepare follow-up on evaluation gate",
          explanation: "Strong claim; ensure candidate can defend dataset construction and failure modes.",
          beforeText: "500-question evaluation dataset",
          suggestedText: "Keep metric; prepare interview story on sampling and hallucination rubric",
          evidenceSource: "ev-eval",
          expectedScoreImpact: 1,
        },
      ],
    },
  ];

  for (const ad of auditDefs) {
    const run: AuditRunRecord = {
      ...ad.run,
      createdAt: ad.run.createdAt ?? ad.run.completedAt ?? ts,
      updatedAt: ad.run.completedAt ?? ts,
    };
    store.auditRuns.set(run.id, run);
    for (const f of ad.findings) {
      const finding: AuditFindingRecord = {
        ...f,
        id: f.id ?? newId("af"),
        auditRunId: run.id,
        auditRunPublicId: run.publicId,
      };
      store.auditFindings.set(finding.id, finding);
    }
  }

  const extras = getDemoExtras(store);
  extras.mistakeMemory = [
    {
      id: "mm-1",
      applicationId: "app-cisco",
      originatingAudit: "em-1",
      affectedVersion: "V1",
      rule: "Avoid generic ownership language",
      status: "active",
      appliedIn: ["V2", "V3", "V4"],
    },
    {
      id: "mm-2",
      applicationId: "app-cisco",
      originatingAudit: "hr-2",
      affectedVersion: "V2",
      rule: "Keep the summary below three lines",
      status: "active",
      appliedIn: ["V3", "V4"],
    },
    {
      id: "mm-3",
      applicationId: "app-cisco",
      originatingAudit: "em-2",
      affectedVersion: "V3",
      rule: "Do not add unsupported Kubernetes ownership",
      status: "active",
      appliedIn: ["V4"],
    },
    {
      id: "mm-4",
      applicationId: "app-cisco",
      originatingAudit: "em-1",
      affectedVersion: "V1",
      rule: "Do not repeat the same latency metric across unrelated bullets",
      status: "active",
      appliedIn: ["V2", "V3", "V4"],
    },
    {
      id: "mm-5",
      applicationId: "app-cisco",
      originatingAudit: "hr-1",
      affectedVersion: "V0",
      rule: "Avoid reintroducing previously removed buzzwords",
      status: "active",
      appliedIn: ["V1", "V2", "V3", "V4"],
    },
    {
      id: "mm-6",
      applicationId: "app-cisco",
      originatingAudit: "em-2",
      affectedVersion: "V3",
      rule: "Use OpenSearch only where evidence supports it",
      status: "active",
      appliedIn: ["V4"],
    },
    {
      id: "mm-7",
      applicationId: "app-cisco",
      originatingAudit: "em-1",
      affectedVersion: "V1",
      rule: "Preserve the strongest scale indicator",
      status: "active",
      appliedIn: ["V2", "V3", "V4"],
    },
  ];

  const interviewId = "00000000-0000-4000-8000-000000000060";
  store.interviews.set(interviewId, {
    id: interviewId,
    publicId: "int-1",
    tenantId,
    applicationId: "00000000-0000-4000-8000-000000000040",
    applicationPublicId: "app-cisco",
    mode: "resume-defense",
    status: "ended",
    payload: {
      difficulty: "medium",
      durationMinutes: 30,
      interviewerPersona: "Engineering manager",
      voiceMode: false,
      resumeVersionId: "rv-v4",
      currentQuestionIndex: 2,
      readinessScore: 82,
      startedAt: "2026-08-29T15:00:00Z",
      endedAt: "2026-08-29T15:28:00Z",
      questions: [
        {
          id: "q1",
          prompt:
            "Walk me through how you designed and evaluated the RAG system that reduced latency from 2.1 seconds to 820 milliseconds.",
          type: "resume-defense",
          competency: "RAG systems",
          evidenceCueIds: ["ev-rag", "ev-eval"],
        },
      ],
      transcript: [],
      feedback: {
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
      },
    },
    createdAt: "2026-08-29T15:00:00Z",
    updatedAt: "2026-08-29T15:28:00Z",
    deletedAt: null,
  });

  const wfId = newId("wr");
  store.workflowRuns.set(wfId, {
    id: wfId,
    publicId: "wf-cisco-final-qa",
    tenantId,
    applicationId: "00000000-0000-4000-8000-000000000040",
    applicationPublicId: "app-cisco",
    stage: "FINAL_QA_RUNNING",
    status: "waiting_review",
    attempt: 1,
    idempotencyKey: `tenant:${tenantId}:app:app-cisco:FINAL_QA_RUNNING`,
    inputVersion: "V4",
    maxAttempts: 5,
    traceId: "tr_demo_cisco_final",
    startedAt: "2026-08-28T09:30:00Z",
    payload: { demo: true },
    createdAt: "2026-08-28T09:30:00Z",
    updatedAt: "2026-08-28T09:30:00Z",
  });

  store.workflowEvents.push(
    {
      id: newId("we"),
      publicId: "wevt_0001",
      workflowRunId: wfId,
      workflowRunPublicId: "wf-cisco-final-qa",
      tenantId,
      applicationId: "00000000-0000-4000-8000-000000000040",
      applicationPublicId: "app-cisco",
      stage: "V4_READY",
      status: "completed",
      message: "Final V4 generated with score 91",
      seq: 1,
      metadata: { score: 91 },
      createdAt: "2026-08-28T09:30:00Z",
    },
    {
      id: newId("we"),
      publicId: "wevt_0002",
      workflowRunId: wfId,
      workflowRunPublicId: "wf-cisco-final-qa",
      tenantId,
      applicationId: "00000000-0000-4000-8000-000000000040",
      applicationPublicId: "app-cisco",
      stage: "FINAL_QA_RUNNING",
      status: "waiting_review",
      message: "Cisco resume ready for Final QA",
      seq: 2,
      metadata: {},
      createdAt: "2026-08-28T09:35:00Z",
    },
  );
}
