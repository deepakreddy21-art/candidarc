import { z } from "zod";

export const confidenceSchema = z.enum(["high", "medium", "low"]);

export const jobExtractionSchema = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  location: z.string().optional(),
  employmentType: z.string().optional(),
  seniority: z.string().optional(),
  requiredQualifications: z.array(z.string()).default([]),
  preferredQualifications: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  targetTechnologies: z.array(z.string()).default([]),
});

export type JobExtractionOutput = z.infer<typeof jobExtractionSchema>;

export const researchSourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  accessedAt: z.string(),
  supportingText: z.string(),
  confidence: confidenceSchema,
  classification: z.enum(["explicit", "inferred", "uncertain"]),
  relevance: z.string(),
});

export const researchSchema = z.object({
  findings: z.array(
    z.object({
      category: z.enum(["role", "company", "team", "project", "technology", "hiring-signal"]),
      title: z.string(),
      summary: z.string(),
      confidence: confidenceSchema,
      status: z.enum(["verified", "inferred", "unverified", "disputed"]),
      sourceIds: z.array(z.string()),
    }),
  ),
  sources: z.array(researchSourceSchema),
  overallConfidence: z.number().min(0).max(100),
  companyResearchStatus: z.enum(["available", "unavailable"]).optional(),
});

export const evidenceMatchSchema = z.object({
  rows: z.array(
    z.object({
      requirement: z.string(),
      importance: z.enum(["required", "preferred"]),
      evidenceIds: z.array(z.string()),
      evidenceStrength: confidenceSchema,
      resumeUsage: z.enum(["used", "partial", "unused"]),
      coverageGap: z.string().optional(),
    }),
  ),
  evidenceCoverage: z.number().min(0).max(100),
});

export const resumeBulletSchema = z.object({
  text: z.string().min(1),
  evidenceIds: z.array(z.string()).min(1),
  matchedRequirements: z.array(z.string()),
  technologies: z.array(z.string()),
  confidence: confidenceSchema,
  claimRisk: z.enum(["low", "medium", "high"]),
  sourceVersion: z.string(),
});

const resumeItemSchema = z.object({
  id: z.string().optional(),
  heading: z.string(),
  subheading: z.string().optional(),
  location: z.string().optional(),
  dates: z.string().optional(),
  bullets: z.array(resumeBulletSchema),
});

export const resumeSectionSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["summary", "skills", "experience", "projects", "education", "certifications"]),
  title: z.string(),
  order: z.number().int().nonnegative().optional(),
  content: z.string().optional(),
  bullets: z.array(resumeBulletSchema).optional(),
  items: z.array(resumeItemSchema).optional(),
}).refine((section) => Boolean(section.content || section.bullets?.length || section.items?.length), {
  message: "A resume section must contain content, bullets, or items",
});

export const resumeSchema = z.object({
  /** Unbounded absolute version (>=0). Cycle step 0–4 is owned by the pipeline, not this field. */
  versionNumber: z.number().int().min(0),
  score: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    atsCompatibility: z.number().min(0).max(100),
    jobAlignment: z.number().min(0).max(100),
    recruiterReadability: z.number().min(0).max(100),
    impact: z.number().min(0).max(100),
    quantification: z.number().min(0).max(100),
    technicalDepth: z.number().min(0).max(100),
    competencyCoverage: z.number().min(0).max(100),
    evidenceConfidence: z.number().min(0).max(100),
    writingQuality: z.number().min(0).max(100),
    formatIntegrity: z.number().min(0).max(100),
  }),
  notes: z.string(),
  sections: z.array(resumeSectionSchema),
});

export const auditSchema = z.object({
  lens: z.enum(["hr-1", "em-1", "hr-2", "em-2"]),
  reviewsVersion: z.number().int(),
  producesVersion: z.number().int(),
  scoreBefore: z.number(),
  scoreAfter: z.number(),
  summary: z.string(),
  findings: z.array(
    z.object({
      severity: z.enum(["critical", "major", "minor", "suggestion"]),
      section: z.string(),
      title: z.string(),
      explanation: z.string(),
      beforeText: z.string(),
      suggestedText: z.string(),
      expectedScoreImpact: z.number(),
      evidenceSource: z.string().optional(),
    }),
  ),
});

export const mistakeMemorySchema = z.object({
  rules: z.array(
    z.object({
      category: z.string(),
      rule: z.string(),
      severity: z.enum(["critical", "major", "minor", "suggestion"]),
      originatingAudit: z.enum(["hr-1", "em-1", "hr-2", "em-2"]),
      affectedVersion: z.string(),
    }),
  ),
});

export const finalQaSchema = z.object({
  passed: z.boolean(),
  checks: z.array(
    z.object({
      label: z.string(),
      status: z.enum(["pass", "fail", "warning", "pending"]),
      detail: z.string(),
    }),
  ),
});

export type ResumeOutput = z.infer<typeof resumeSchema>;
