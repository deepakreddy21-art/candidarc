/**
 * GENERATED FILE — DO NOT EDIT.
 * Zod runtime schemas derived from services/python-backend/openapi.json components.
 * Regenerate: npm run contract:python
 */

import { z } from "zod";

export const ScoreBreakdownSchema = z.object({
  "atsCompatibility": z.number().min(0.0).max(100.0),
  "competencyCoverage": z.number().min(0.0).max(100.0),
  "evidenceConfidence": z.number().min(0.0).max(100.0),
  "formatIntegrity": z.number().min(0.0).max(100.0),
  "impact": z.number().min(0.0).max(100.0),
  "jobAlignment": z.number().min(0.0).max(100.0),
  "quantification": z.number().min(0.0).max(100.0),
  "recruiterReadability": z.number().min(0.0).max(100.0),
  "technicalDepth": z.number().min(0.0).max(100.0),
  "writingQuality": z.number().min(0.0).max(100.0),
}).strict();
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const ResumeBulletSchema = z.object({
  "claim_risk": z.enum(["low", "medium", "high"]).optional(),
  "confidence": z.enum(["high", "medium", "low"]).optional(),
  "evidence_ids": z.array(z.string().min(1).max(128)).min(1).max(32),
  "matched_requirements": z.array(z.string().max(512)).max(50).optional(),
  "source_version": z.string().max(64).optional(),
  "technologies": z.array(z.string().max(128)).max(50).optional(),
  "text": z.string().min(1).max(4000),
}).strict();
export type ResumeBullet = z.infer<typeof ResumeBulletSchema>;

export const ResumeItemSchema = z.object({
  "bullets": z.array(ResumeBulletSchema).max(50).optional(),
  "dates": z.string().max(128).nullable().optional(),
  "heading": z.string().min(1).max(512),
  "location": z.string().max(256).nullable().optional(),
  "subheading": z.string().max(512).nullable().optional(),
}).strict();
export type ResumeItem = z.infer<typeof ResumeItemSchema>;

export const ResumeSectionSchema = z.object({
  "bullets": z.array(ResumeBulletSchema).max(50).nullable().optional(),
  "content": z.string().max(8000).nullable().optional(),
  "items": z.array(ResumeItemSchema).max(50).nullable().optional(),
  "order": z.number().int().min(0.0).max(100.0).optional(),
  "title": z.string().min(1).max(512),
  "type": z.enum(["summary", "skills", "experience", "projects", "education", "certifications"]),
}).strict();
export type ResumeSection = z.infer<typeof ResumeSectionSchema>;

export const ResumeDocumentSchema = z.object({
  "absolute_version": z.number().int().min(0.0),
  "cycle_step": z.number().int().min(0.0).max(4.0),
  "notes": z.string().max(8000),
  "score": z.number().min(0.0).max(100.0),
  "score_breakdown": ScoreBreakdownSchema,
  "score_explanations": z.union([z.object({
}).catchall(z.string()), z.array(z.string())]).optional(),
  "score_rubric_version": z.string().max(128).optional(),
  "sections": z.array(ResumeSectionSchema).min(1).max(20),
  "version_number": z.number().int().min(0.0),
}).strict();
export type ResumeDocument = z.infer<typeof ResumeDocumentSchema>;

export const ProviderUsageSchema = z.object({
  "cached_tokens": z.number().int().min(0.0).nullable().optional(),
  "estimated_cost_cents": z.number().min(0.0).nullable().optional(),
  "input_tokens": z.number().int().min(0.0).nullable().optional(),
  "latency_ms": z.number().int().min(0.0),
  "model": z.string().min(1).max(512),
  "output_tokens": z.number().int().min(0.0).nullable().optional(),
  "prompt_version": z.string().max(128),
  "provider": z.string().min(1).max(512),
  "provider_request_id": z.string().max(256).nullable().optional(),
  "retry_count": z.number().int().min(0.0).max(20.0).optional(),
  "rubric_version": z.string().max(128).nullable().optional(),
}).strict();
export type ProviderUsage = z.infer<typeof ProviderUsageSchema>;

export const ResumeGenerateResponseSchema = z.object({
  "latency_ms": z.number().int().min(0.0),
  "model": z.string().min(1).max(512),
  "prompt_version": z.string().min(1).max(512),
  "provider": z.string().min(1).max(512),
  "resume": ResumeDocumentSchema,
  "usage": ProviderUsageSchema.nullable().optional(),
}).strict();
export type ResumeGenerateResponse = z.infer<typeof ResumeGenerateResponseSchema>;

export const AuditFindingSchema = z.object({
  "before_text": z.string().max(4000),
  "edited_text": z.string().max(4000).nullable().optional(),
  "evidence_ids": z.array(z.string().min(1).max(128)).max(32).optional(),
  "evidence_source": z.string().max(128).nullable().optional(),
  "expected_score_impact": z.number().min(-100.0).max(100.0),
  "explanation": z.string().min(1).max(4000),
  "rejection_reason": z.string().max(512).nullable().optional(),
  "section": z.string().min(1).max(512),
  "severity": z.enum(["critical", "major", "minor", "suggestion"]),
  "status": z.enum(["open", "accepted", "rejected", "edited"]).nullable().optional(),
  "suggested_text": z.string().max(4000),
  "title": z.string().min(1).max(512),
}).strict();
export type AuditFinding = z.infer<typeof AuditFindingSchema>;

export const AuditResponseSchema = z.object({
  "findings": z.array(AuditFindingSchema).max(100),
  "lens": z.enum(["hr-1", "em-1", "hr-2", "em-2"]),
  "model": z.string().min(1).max(512),
  "produces_version": z.number().int().min(0.0),
  "provider": z.string().min(1).max(512),
  "rejected_findings": z.array(AuditFindingSchema).max(100).optional(),
  "reviews_version": z.number().int().min(0.0),
  "score_after": z.number().min(0.0).max(100.0),
  "score_before": z.number().min(0.0).max(100.0),
  "summary": z.string().min(1).max(4000),
  "usage": ProviderUsageSchema.nullable().optional(),
}).strict();
export type AuditResponse = z.infer<typeof AuditResponseSchema>;

export const FinalQaCheckSchema = z.object({
  "detail": z.string().max(2000),
  "label": z.string().min(1).max(512),
  "status": z.enum(["pass", "warn", "fail", "warning", "pending"]),
}).strict();
export type FinalQaCheck = z.infer<typeof FinalQaCheckSchema>;

export const FinalQaResponseSchema = z.object({
  "checks": z.array(FinalQaCheckSchema).max(100),
  "model": z.string().min(1).max(512),
  "passed": z.boolean(),
  "provider": z.string().min(1).max(512),
  "usage": ProviderUsageSchema.nullable().optional(),
}).strict();
export type FinalQaResponse = z.infer<typeof FinalQaResponseSchema>;

export const JobParseResponseSchema = z.object({
  "company": z.string().max(512).nullable().optional(),
  "employment_type": z.string().max(128).nullable().optional(),
  "location": z.string().max(512).nullable().optional(),
  "preferred_qualifications": z.array(z.string().max(2000)).max(100).optional(),
  "required_qualifications": z.array(z.string().max(2000)).max(100).optional(),
  "responsibilities": z.array(z.string().max(2000)).max(100).optional(),
  "role": z.string().max(512).nullable().optional(),
  "seniority": z.string().max(128).nullable().optional(),
  "target_technologies": z.array(z.string().max(128)).max(100).optional(),
  "title": z.string().max(512).nullable().optional(),
  "warnings": z.array(z.string().max(256)).max(50).optional(),
}).strict();
export type JobParseResponse = z.infer<typeof JobParseResponseSchema>;

export const ResearchFindingSchema = z.object({
  "category": z.string().min(1).max(512),
  "confidence": z.enum(["high", "medium", "low"]),
  "source_ids": z.array(z.string().min(1).max(128)).max(50).optional(),
  "status": z.enum(["supported", "uncertain", "unavailable", "verified", "inferred", "unverified", "disputed"]).optional(),
  "summary": z.string().min(1).max(4000),
  "title": z.string().min(1).max(512),
}).strict();
export type ResearchFinding = z.infer<typeof ResearchFindingSchema>;

export const ResearchSynthesizeResponseSchema = z.object({
  "company_research_status": z.string().max(64).nullable().optional(),
  "findings": z.array(ResearchFindingSchema).max(100),
  "overall_confidence": z.number().min(0.0).max(1.0),
  "sources": z.array(z.object({
  "accessed_at": z.string().min(1).max(512),
  "classification": z.enum(["explicit", "inferred", "uncertain"]).optional(),
  "confidence": z.enum(["high", "medium", "low"]).optional(),
  "id": z.string().min(1).max(128),
  "relevance": z.number().min(0.0).max(1.0).optional(),
  "supporting_text": z.string().min(1).max(4000),
  "title": z.string().min(1).max(512),
  "url": z.string().min(1).max(2083),
}).strict()).max(50),
}).strict();
export type ResearchSynthesizeResponse = z.infer<typeof ResearchSynthesizeResponseSchema>;

export const EvidenceMatchRowSchema = z.object({
  "coverage_gap": z.string().max(1000).nullable().optional(),
  "evidence_ids": z.array(z.string().min(1).max(128)).max(32),
  "evidence_strength": z.enum(["strong", "partial", "none"]),
  "importance": z.enum(["required", "preferred", "responsibility"]).optional(),
  "requirement": z.string().max(2000),
  "resume_usage": z.enum(["use", "consider", "skip"]).optional(),
}).strict();
export type EvidenceMatchRow = z.infer<typeof EvidenceMatchRowSchema>;

export const EvidenceMatchResponseSchema = z.object({
  "evidence_coverage": z.number().min(0.0).max(1.0),
  "ranking_method": z.string().max(128).optional(),
  "rows": z.array(EvidenceMatchRowSchema).max(200),
}).strict();
export type EvidenceMatchResponse = z.infer<typeof EvidenceMatchResponseSchema>;

export const MistakeMemoryRuleSchema = z.object({
  "affected_version": z.string().min(1).max(512),
  "category": z.string().min(1).max(512),
  "originating_audit": z.enum(["hr-1", "em-1", "hr-2", "em-2"]),
  "rule": z.string().min(1).max(4000),
  "severity": z.enum(["critical", "major", "minor", "suggestion"]),
}).strict();
export type MistakeMemoryRule = z.infer<typeof MistakeMemoryRuleSchema>;

export const EvidenceItemSchema = z.object({
  "actions": z.array(z.string().max(2000)).max(50).optional(),
  "candidate_confirmation_status": z.string().min(1).max(512),
  "claim_text": z.string().max(4000).nullable().optional(),
  "confidence": z.enum(["high", "medium", "low"]),
  "employer_association": z.string().max(512).nullable().optional(),
  "id": z.string().min(1).max(128),
  "metrics": z.array(z.string().max(512)).max(50).optional(),
  "organization": z.string().max(512).nullable().optional(),
  "owner_user_id": z.string().min(1).max(128),
  "privacy_classification": z.string().max(64).optional(),
  "project_association": z.string().max(512).nullable().optional(),
  "result": z.string().max(4000).nullable().optional(),
  "situation": z.string().max(4000).nullable().optional(),
  "source_type": z.string().max(128).nullable().optional(),
  "task": z.string().max(4000).nullable().optional(),
  "technologies": z.array(z.string().max(128)).max(50).optional(),
  "tenant_id": z.string().min(1).max(128),
  "title": z.string().min(1).max(512),
  "verification_status": z.string().min(1).max(512),
}).strict();
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const PYTHON_OPENAPI_SCHEMA_NAMES = [
  "AuditFinding",
  "AuditRequest",
  "AuditResponse",
  "DeterministicQaCheck",
  "EvidenceIndexRequest",
  "EvidenceIndexResponse",
  "EvidenceItem",
  "EvidenceMatchRequest",
  "EvidenceMatchResponse",
  "EvidenceMatchRow",
  "EvidenceSearchHit",
  "EvidenceSearchRequest",
  "EvidenceSearchResponse",
  "FinalQaCheck",
  "FinalQaRequest",
  "FinalQaResponse",
  "HTTPValidationError",
  "HealthLiveResponse",
  "HealthReadyResponse",
  "JobParseRequest",
  "JobParseResponse",
  "MistakeMemoryRule",
  "ProviderUsage",
  "RequestContext",
  "ResearchFinding",
  "ResearchSource",
  "ResearchSynthesizeRequest",
  "ResearchSynthesizeResponse",
  "ResumeBullet",
  "ResumeDocument-Input",
  "ResumeDocument-Output",
  "ResumeGenerateRequest",
  "ResumeGenerateResponse",
  "ResumeItem",
  "ResumeParseRequest",
  "ResumeParseResponse",
  "ResumeSection-Input",
  "ResumeSection-Output",
  "ScoreBreakdown",
  "ValidationError",
] as const;
