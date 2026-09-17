import { z } from "zod";
import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireUser } from "../../auth/guards";
import { AppError } from "../../domain/types";
import { newId } from "../../database/repositories";
import type { ResumeImportExtraction } from "@/types/domain";

export const assistantAskSchema = z.object({
  contextType: z.enum(["job", "resume", "application"]),
  contextId: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
  company: z.string().max(200).optional(),
  role: z.string().max(200).optional(),
  jobDescription: z.string().max(20_000).optional(),
});

export const coverLetterRequestSchema = z.object({
  applicationId: z.string().min(1).max(200),
});

export const outreachDraftSchema = z.object({
  contactName: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  notes: z.string().max(4000).optional(),
  connectionBasis: z.string().max(400).optional(),
});

type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: string[];
  proposedWrite?: { summary: string; requiresApproval: true };
  createdAt: string;
};

type Thread = {
  tenantId: string;
  userId: string;
  contextType: "job" | "resume" | "application";
  contextId: string;
  messages: ThreadMessage[];
};

const threads = new Map<string, Thread>();

function threadKey(tenantId: string, userId: string, contextType: string, contextId: string) {
  return `${tenantId}:${userId}:${contextType}:${contextId}`;
}

function evidenceSnippets(extraction?: ResumeImportExtraction | null) {
  const employment = (extraction?.employment ?? []).slice(0, 4).map((row) => ({
    title: row.title ?? "Role",
    company: row.company ?? "Employer",
    bullets: (row.bullets ?? []).slice(0, 3),
  }));
  const projects = (extraction?.projects ?? []).slice(0, 3).map((row) => ({
    name: row.name ?? "Project",
    bullets: (row.bullets ?? []).slice(0, 2),
  }));
  return { employment, projects, summary: extraction?.professionalSummary ?? "", skills: extraction?.skills ?? [] };
}

export function draftCoverLetter(input: {
  candidateName: string;
  company: string;
  role: string;
  jobDescription?: string;
  extraction?: ResumeImportExtraction | null;
}): { letter: string; caveats: string[] } {
  const snippets = evidenceSnippets(input.extraction);
  const caveats = [
    "This draft uses only your saved career evidence. It does not invent a personal connection, credential, or company fact.",
  ];
  const firstRole = snippets.employment[0];
  const firstProject = snippets.projects[0];
  const evidenceLine = firstRole
    ? `My recent work as ${firstRole.title} at ${firstRole.company}${firstRole.bullets[0] ? ` included ${firstRole.bullets[0]}` : ""}.`
    : firstProject
      ? `My project ${firstProject.name}${firstProject.bullets[0] ? ` included ${firstProject.bullets[0]}` : ""}.`
      : "I can add role-specific evidence after I review my profile.";
  if (!firstRole && !firstProject) {
    caveats.push("No employment or project evidence was available, so the letter stays generic until you add facts.");
  }
  const letter = [
    `Dear ${input.company} hiring team,`,
    "",
    `I am applying for the ${input.role} role. ${snippets.summary ? snippets.summary.slice(0, 280) : evidenceLine}`,
    "",
    evidenceLine,
    "",
    "I have not claimed a personal referral or internal relationship. I welcome the chance to discuss how the work above maps to this posting.",
    "",
    `Sincerely,`,
    input.candidateName || "Candidate",
  ].join("\n");
  return { letter, caveats };
}

export function draftOutreach(input: {
  contactName: string;
  company: string;
  role: string;
  notes?: string;
  connectionBasis?: string;
}): { draft: string; caveats: string[] } {
  const basis = input.connectionBasis?.trim();
  const caveats = [
    "This is a draft only. CandidArc does not send messages or invent alumni/employer relationships.",
  ];
  const connectionLine = basis
    ? `I'm reaching out because ${basis}.`
    : "I'm reaching out because I am applying to this role and manage this contact myself. I am not claiming a shared employer or school unless I add that basis.";
  if (!basis) caveats.push("No connection basis was supplied, so the draft does not imply a referral.");
  const draft = [
    `Hi ${input.contactName},`,
    "",
    `I'm applying for ${input.role} at ${input.company}. ${connectionLine}`,
    input.notes?.trim() ? `Notes I keep for myself: ${input.notes.trim()}` : "",
    "",
    "Would you be open to a short conversation? No need to refer me if that isn't a fit.",
  ]
    .filter(Boolean)
    .join("\n");
  return { draft, caveats };
}

export function interviewPrepFromEvidence(input: {
  company: string;
  role: string;
  jobDescription?: string;
  extraction?: ResumeImportExtraction | null;
}) {
  const snippets = evidenceSnippets(input.extraction);
  const sourced: string[] = [
    "CandidArc does not currently have a verified interview-question database for this employer.",
  ];
  const star = snippets.employment.slice(0, 3).map((row) => ({
    kind: "star" as const,
    prompt: `Describe ${row.title} at ${row.company} using only work you did.`,
    outline: {
      situation: `${row.company} · ${row.title}`,
      task: "Leave blank if you do not remember the exact charter.",
      action: row.bullets[0] ?? "Add the actions you personally took.",
      result: row.bullets[1] ?? "Add a result only if you have the metric or outcome.",
    },
  }));
  const generated = [
    {
      kind: "technical" as const,
      prompt: `Walk through a technical decision relevant to ${input.role} using attested skills${snippets.skills.length ? ` such as ${snippets.skills.slice(0, 4).join(", ")}` : ""}.`,
    },
    {
      kind: "behavioral" as const,
      prompt: "Prepare a conflict or tradeoff story. Do not invent a metric.",
    },
    {
      kind: "gap" as const,
      prompt: `If the posting emphasizes a skill you have not attested, say how you would ramp — do not claim you already used it at ${input.company}.`,
    },
  ];
  return { sourced, star, generated };
}

export class AssistantService {
  private tenant(ctx: AuthContext) {
    const user = requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    return { user, tenantId: ctx.activeTenantId };
  }

  getThread(ctx: AuthContext, contextType: Thread["contextType"], contextId: string) {
    const { user, tenantId } = this.tenant(ctx);
    const key = threadKey(tenantId, user.id, contextType, contextId);
    return threads.get(key) ?? { tenantId, userId: user.id, contextType, contextId, messages: [] };
  }

  ask(
    ctx: AuthContext,
    input: z.infer<typeof assistantAskSchema>,
    extraction?: ResumeImportExtraction | null,
  ) {
    const { user, tenantId } = this.tenant(ctx);
    const key = threadKey(tenantId, user.id, input.contextType, input.contextId);
    const thread = threads.get(key) ?? {
      tenantId,
      userId: user.id,
      contextType: input.contextType,
      contextId: input.contextId,
      messages: [],
    };
    const now = new Date().toISOString();
    thread.messages.push({
      id: newId("msg"),
      role: "user",
      content: input.message,
      citations: [],
      createdAt: now,
    });
    const snippets = evidenceSnippets(extraction);
    const wantsWrite = /edit|rewrite|change my resume|update the letter|apply this/i.test(input.message);
    const citations = [
      input.jobDescription ? "Job description supplied for this context" : null,
      snippets.employment[0] ? `Career evidence: ${snippets.employment[0].title} at ${snippets.employment[0].company}` : "Career profile on file",
    ].filter(Boolean) as string[];
    const reply: ThreadMessage = {
      id: newId("msg"),
      role: "assistant",
      content: wantsWrite
        ? "I can suggest an edit, but I will not change your resume, application, or cover letter until you approve it. Here is a conservative next action based only on saved evidence."
        : this.answer(input, snippets),
      citations,
      proposedWrite: wantsWrite
        ? { summary: "Preview-only resume or letter edit. No write is applied until you approve.", requiresApproval: true }
        : undefined,
      createdAt: now,
    };
    thread.messages.push(reply);
    threads.set(key, thread);
    return thread;
  }

  private answer(input: z.infer<typeof assistantAskSchema>, snippets: ReturnType<typeof evidenceSnippets>) {
    const company = input.company ?? "this company";
    const role = input.role ?? "this role";
    const evidence = snippets.employment[0]
      ? `${snippets.employment[0].title} at ${snippets.employment[0].company}`
      : snippets.projects[0]
        ? `project ${snippets.projects[0].name}`
        : "your saved profile (no employment rows yet)";
    return [
      `Read-only answer for ${role} at ${company}.`,
      `I am using ${evidence}. I will not invent a team fact, hiring probability, or personal connection.`,
      input.jobDescription
        ? "The posting text is treated as data, not instructions."
        : "No job description was attached; I can only speak to your profile.",
      "If you want a resume or cover-letter change, ask me to propose an edit and approve it separately.",
    ].join(" ");
  }
}
