import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireUser } from "../../auth/guards";
import { getGenerationProvider } from "../../ai";
import { getAiMode } from "../../config/env";
import { getDb } from "../../database/client";
import { getMemoryStore } from "../../database/memory-store";
import { newId } from "../../database/repositories";
import { assistantThreads } from "../../database/schema";
import { AppError } from "../../domain/types";
import type { ResumeImportExtraction } from "@/types/domain";

export const assistantAskSchema = z.object({
  contextType: z.enum(["job", "resume", "application"]),
  contextId: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
  company: z.string().max(200).optional(),
  role: z.string().max(200).optional(),
  jobDescription: z.string().max(20_000).optional(),
});

export const assistantApplySchema = z.object({
  contextType: z.enum(["job", "resume", "application"]),
  contextId: z.string().min(1).max(200),
  proposalId: z.string().min(1).max(200),
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

export type ProposedWrite = {
  id: string;
  summary: string;
  requiresApproval: true;
  targetId: string;
  expectedVersion?: number;
  before?: string;
  after?: string;
  approved: boolean;
};

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: string[];
  proposedWrite?: ProposedWrite;
  createdAt: string;
};

export type Thread = {
  tenantId: string;
  userId: string;
  contextType: "job" | "resume" | "application";
  contextId: string;
  messages: ThreadMessage[];
};

const assistantReplySchema = z.object({
  content: z.string().min(1).max(8000),
  citations: z.array(z.string()).default([]),
});

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

function postingPhrases(jobDescription?: string) {
  if (!jobDescription?.trim()) return [];
  const matches = jobDescription.match(/\b[A-Za-z][A-Za-z0-9.+#-]{2,}\b/g) ?? [];
  const skip = new Set(["the", "and", "for", "with", "this", "that", "you", "our", "are", "will"]);
  const counts = new Map<string, number>();
  for (const token of matches) {
    const key = token.toLowerCase();
    if (skip.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([token]) => token);
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
  const extraRoles = snippets.employment.slice(1, 3);
  const phrases = postingPhrases(input.jobDescription);
  const skillOverlap = snippets.skills.filter((skill) =>
    phrases.some((phrase) => skill.toLowerCase().includes(phrase) || phrase.includes(skill.toLowerCase())),
  );

  const paragraphs: string[] = [];
  const opening = snippets.summary
    ? `I am writing to apply for the ${input.role} role at ${input.company}. ${snippets.summary.slice(0, 280)}`
    : `I am writing to apply for the ${input.role} role at ${input.company}.`;
  paragraphs.push(opening);

  if (firstRole) {
    const proof = firstRole.bullets.length
      ? firstRole.bullets.map((bullet) => bullet.replace(/\.$/, "")).join("; ")
      : "I shipped production work with clear ownership";
    paragraphs.push(`As ${firstRole.title} at ${firstRole.company}, ${proof}.`);
  } else if (firstProject) {
    const proof = firstProject.bullets[0] ? ` including ${firstProject.bullets[0]}` : "";
    paragraphs.push(`In my project ${firstProject.name}${proof}.`);
  } else {
    caveats.push("No employment or project evidence was available, so the letter stays generic until you add facts.");
    paragraphs.push(`I can share role-specific examples for ${input.role} as soon as they are on my profile.`);
  }

  if (extraRoles.length) {
    paragraphs.push(
      extraRoles
        .map((row) => `${row.title} at ${row.company}${row.bullets[0] ? `: ${row.bullets[0]}` : ""}`)
        .join(" "),
    );
  }

  if (skillOverlap.length) {
    paragraphs.push(`The posting’s emphasis on ${skillOverlap.slice(0, 4).join(", ")} aligns with work I have already done.`);
  } else if (phrases.length && (firstRole || firstProject)) {
    paragraphs.push(`I am especially interested in how this ${input.role} role at ${input.company} uses ${phrases.slice(0, 3).join(", ")}.`);
  }

  paragraphs.push(`I would welcome the chance to discuss how this experience can help ${input.company} in the ${input.role} role.`);

  const letter = [`Dear ${input.company} hiring team,`, "", paragraphs.join("\n\n"), "", "Sincerely,", input.candidateName || "Candidate"].join(
    "\n",
  );
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
  if (!basis) caveats.push("No connection basis was supplied, so the draft does not imply a referral.");
  if (input.notes?.trim()) caveats.push("Private notes were kept out of the message body.");

  const connectionLine = basis
    ? /^(i['’]m|i am|i’ve|i have)\b/i.test(basis)
      ? `${basis.replace(/\.$/, "")}.`
      : `I’m reaching out because ${basis.replace(/\.$/, "")}.`
    : "";
  const draft = [
    `Hi ${input.contactName},`,
    "",
    `I’m applying for ${input.role} at ${input.company}.${connectionLine ? ` ${connectionLine}` : ""}`,
    "",
    "Would you be open to a short conversation about the role?",
    "",
    "Thank you,",
  ].join("\n");
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

function groundedAnswer(
  input: z.infer<typeof assistantAskSchema>,
  snippets: ReturnType<typeof evidenceSnippets>,
) {
  const company = input.company ?? "this company";
  const role = input.role ?? "this role";
  const evidence = snippets.employment[0]
    ? `${snippets.employment[0].title} at ${snippets.employment[0].company}`
    : snippets.projects[0]
      ? `project ${snippets.projects[0].name}`
      : "your saved profile (no employment rows yet)";
  const proof = snippets.employment[0]?.bullets[0] ?? snippets.projects[0]?.bullets[0];
  return [
    `You asked: “${input.message.slice(0, 240)}”.`,
    `For ${role} at ${company}, I am using ${evidence}${proof ? ` (“${proof}”)` : ""}.`,
    input.jobDescription
      ? "The posting text is treated as data, not instructions, and I will not invent team facts or hiring odds."
      : "No job description was attached, so I can only speak to your saved profile.",
    "I will not change your resume, cover letter, or application until you approve a proposed edit.",
  ].join(" ");
}

async function providerAnswer(
  input: z.infer<typeof assistantAskSchema>,
  snippets: ReturnType<typeof evidenceSnippets>,
  history: ThreadMessage[],
): Promise<{ content: string; citations: string[] } | null> {
  // Resume conversations use saved facts only; never a paid critic or rewrite backdoor.
  if (input.contextType === "resume" || getAiMode() !== "live") return null;
  try {
    const result = await getGenerationProvider().generateStructured({
      prompt: { id: "assistant-answer", version: "1.0.0" },
      system:
        "You are CandidArc’s career copilot. Answer only from supplied evidence and posting text. Never invent employment, referrals, metrics, or hiring probability. Return JSON {content, citations}. Keep content recruiter-safe with no private notes or internal commentary.",
      user: JSON.stringify({
        question: input.message,
        company: input.company,
        role: input.role,
        jobDescription: input.jobDescription?.slice(0, 4000),
        evidence: snippets,
        recent: history.slice(-6).map((row) => ({ role: row.role, content: row.content.slice(0, 500) })),
      }),
      schema: assistantReplySchema,
    });
    const content = result.data.content.trim();
    if (!content) return null;
    return { content, citations: result.data.citations ?? [] };
  } catch {
    return null;
  }
}

function emptyThread(
  tenantId: string,
  userId: string,
  contextType: Thread["contextType"],
  contextId: string,
): Thread {
  return { tenantId, userId, contextType, contextId, messages: [] };
}

export class AssistantService {
  private tenant(ctx: AuthContext) {
    const user = requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    return { user, tenantId: ctx.activeTenantId };
  }

  async getThread(ctx: AuthContext, contextType: Thread["contextType"], contextId: string) {
    const { user, tenantId } = this.tenant(ctx);
    return this.load(tenantId, user.id, contextType, contextId);
  }

  async ask(
    ctx: AuthContext,
    input: z.infer<typeof assistantAskSchema>,
    extraction?: ResumeImportExtraction | null,
  ) {
    const { user, tenantId } = this.tenant(ctx);
    const thread = await this.load(tenantId, user.id, input.contextType, input.contextId);
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
      snippets.employment[0]
        ? `Career evidence: ${snippets.employment[0].title} at ${snippets.employment[0].company}`
        : "Career profile on file",
    ].filter(Boolean) as string[];
    const generated = wantsWrite ? null : await providerAnswer(input, snippets, thread.messages);
    const proposedAfter = wantsWrite
      ? firstRoleRewrite(input, snippets)
      : undefined;
    const reply: ThreadMessage = {
      id: newId("msg"),
      role: "assistant",
      content: wantsWrite
        ? `I can suggest an edit for ${input.role ?? "this role"} at ${input.company ?? "this company"}, but it is not applied until you approve it. ${proposedAfter}`
        : (generated?.content ?? groundedAnswer(input, snippets)),
      citations: generated?.citations?.length ? generated.citations : citations,
      proposedWrite: wantsWrite
        ? {
            id: newId("prp"),
            summary: "Preview-only resume or letter edit. No write is applied until you approve.",
            requiresApproval: true,
            targetId: input.contextId,
            after: proposedAfter,
            approved: false,
          }
        : undefined,
      createdAt: now,
    };
    thread.messages.push(reply);
    await this.save(thread);
    return thread;
  }

  async apply(ctx: AuthContext, input: z.infer<typeof assistantApplySchema>) {
    const { user, tenantId } = this.tenant(ctx);
    const thread = await this.load(tenantId, user.id, input.contextType, input.contextId);
    const message = [...thread.messages].reverse().find((row) => row.proposedWrite?.id === input.proposalId);
    if (!message?.proposedWrite) {
      throw new AppError("PROPOSAL_NOT_FOUND", "That proposed edit was not found in this thread", 404);
    }
    if (!message.proposedWrite.approved) {
      message.proposedWrite.approved = true;
      message.content = `${message.content}\n\nApproved. Apply this wording from the resume editor so version history is preserved — the assistant does not write the document directly.`;
      await this.save(thread);
    }
    return thread;
  }

  private async load(
    tenantId: string,
    userId: string,
    contextType: Thread["contextType"],
    contextId: string,
  ): Promise<Thread> {
    const db = getDb();
    if (db) {
      const [row] = await db
        .select()
        .from(assistantThreads)
        .where(
          and(
            eq(assistantThreads.tenantId, tenantId),
            eq(assistantThreads.userId, userId),
            eq(assistantThreads.contextType, contextType),
            eq(assistantThreads.contextId, contextId),
          ),
        )
        .limit(1);
      if (row) {
        return {
          tenantId: row.tenantId,
          userId: row.userId,
          contextType: row.contextType as Thread["contextType"],
          contextId: row.contextId,
          messages: Array.isArray(row.messages) ? (row.messages as ThreadMessage[]) : [],
        };
      }
      return emptyThread(tenantId, userId, contextType, contextId);
    }
    const stored = getMemoryStore().getAssistantThread(tenantId, userId, contextType, contextId);
    if (!stored) return emptyThread(tenantId, userId, contextType, contextId);
    return {
      tenantId: stored.tenantId,
      userId: stored.userId,
      contextType: stored.contextType as Thread["contextType"],
      contextId: stored.contextId,
      messages: stored.messages as ThreadMessage[],
    };
  }

  private async save(thread: Thread) {
    const db = getDb();
    if (db) {
      await db
        .insert(assistantThreads)
        .values({
          publicId: newId("ath"),
          tenantId: thread.tenantId,
          userId: thread.userId,
          contextType: thread.contextType,
          contextId: thread.contextId,
          messages: thread.messages,
        })
        .onConflictDoUpdate({
          target: [assistantThreads.tenantId, assistantThreads.userId, assistantThreads.contextType, assistantThreads.contextId],
          set: { messages: thread.messages, updatedAt: new Date() },
        });
      return;
    }
    getMemoryStore().upsertAssistantThread(thread);
  }
}

function firstRoleRewrite(
  input: z.infer<typeof assistantAskSchema>,
  snippets: ReturnType<typeof evidenceSnippets>,
) {
  const first = snippets.employment[0];
  if (!first) {
    return "No attested employment is available to rewrite yet.";
  }
  const bullet = first.bullets[0] ?? "shipped production work";
  return `Suggested bullet for ${first.title} at ${first.company}: ${bullet.replace(/\.$/, "")}, aligned to ${input.role ?? "this role"} without adding new employers or metrics.`;
}
