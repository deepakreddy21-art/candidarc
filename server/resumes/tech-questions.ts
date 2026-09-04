import { createHash } from "crypto";
import { AppError } from "../domain/types";

export type TechAnswerKind = "yes_professional" | "yes_project" | "similar" | "no" | "not_sure";
export type TechEvidenceStatus = "user_attested" | "source_verified" | "rejected" | "unanswered";

export type TechQuestion = {
  id: string;
  technology: string;
  reason: string;
  answer?: TechAnswerKind;
  evidence?: string;
  evidenceStatus?: TechEvidenceStatus;
};

const COMMON_TECH = [
  "TypeScript", "JavaScript", "Python", "Java", "React", "Next.js", "Node.js",
  "AWS", "Azure", "GCP", "Kubernetes", "Docker", "Terraform", "PostgreSQL",
  "Redis", "GraphQL", "REST", "Kafka", "Spark", "PyTorch", "TensorFlow",
];

export function extractTechQuestions(input: {
  jobDescription?: string;
  researchFindings?: unknown[];
  candidateTechnologies?: string[];
}): TechQuestion[] {
  const source = `${input.jobDescription ?? ""} ${JSON.stringify(input.researchFindings ?? [])}`;
  const known = new Set((input.candidateTechnologies ?? []).map((item) => item.toLowerCase()));
  return COMMON_TECH
    .filter((technology) => new RegExp(`\\b${technology.replace(".", "\\.")}\\b`, "i").test(source))
    .filter((technology) => !known.has(technology.toLowerCase()))
    .slice(0, 5)
    .map((technology) => ({
      id: `tech_${createHash("sha256").update(technology.toLowerCase()).digest("hex").slice(0, 12)}`,
      technology,
      reason: "This technology appears important for the target role.",
      evidenceStatus: "unanswered",
    }));
}

export function validateTechAnswers(
  answers: Array<{ id: string; answer: TechAnswerKind; evidence?: string }>,
): void {
  for (const answer of answers) {
    if ((answer.answer === "yes_professional" || answer.answer === "yes_project") && !answer.evidence?.trim()) {
      throw new AppError(
        "TECH_EVIDENCE_REQUIRED",
        `Evidence is required when confirming experience with technology answer ${answer.id}`,
        422,
      );
    }
  }
}

export function applyTechAnswers(
  questions: TechQuestion[],
  answers: Array<{ id: string; answer: TechAnswerKind; evidence?: string }>,
): TechQuestion[] {
  validateTechAnswers(answers);
  const byId = new Map(answers.map((answer) => [answer.id, answer]));
  return questions.map((question) => {
    const answer = byId.get(question.id);
    if (!answer) return question;
    const isYes = answer.answer === "yes_professional" || answer.answer === "yes_project";
    const evidence = answer.evidence?.trim() || undefined;
    return {
      ...question,
      answer: answer.answer,
      evidence,
      evidenceStatus: isYes
        ? evidence
          ? "user_attested"
          : "unanswered"
        : answer.answer === "no" || answer.answer === "similar" || answer.answer === "not_sure"
          ? "rejected"
          : "unanswered",
    };
  });
}

export function hasUnansweredTechQuestions(questions: TechQuestion[]): boolean {
  return questions.some((question) => question.evidenceStatus === "unanswered" || !question.evidenceStatus);
}

/** Exact technologies are claimable only after an affirmative answer with concrete evidence. */
export function claimableTechnologies(questions: TechQuestion[]): string[] {
  return questions
    .filter((question) =>
      (question.answer === "yes_professional" || question.answer === "yes_project") &&
      Boolean(question.evidence?.trim()) &&
      (question.evidenceStatus === "user_attested" || question.evidenceStatus === "source_verified"),
    )
    .map((question) => question.technology);
}

/** Technologies that must never be presented as the candidate’s experience. */
export function excludedTechnologies(questions: TechQuestion[]): string[] {
  const claimable = new Set(claimableTechnologies(questions));
  return questions
    .filter((question) => {
      if (claimable.has(question.technology)) return false;
      if (!question.answer) return true;
      if (question.answer === "no" || question.answer === "not_sure" || question.answer === "similar") return true;
      if ((question.answer === "yes_professional" || question.answer === "yes_project") && !question.evidence?.trim()) {
        return true;
      }
      return question.evidenceStatus === "rejected" || question.evidenceStatus === "unanswered";
    })
    .map((question) => question.technology);
}

export function techAnswersFingerprint(
  answers: Array<{ id: string; answer: TechAnswerKind; evidence?: string }>,
): string {
  const normalized = answers
    .map((answer) => `${answer.id}:${answer.answer}:${answer.evidence?.trim() ?? ""}`)
    .sort()
    .join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export function attestedEvidenceEntries(questions: TechQuestion[]): Array<{ technology: string; evidence: string }> {
  return questions
    .filter((question) =>
      (question.answer === "yes_professional" || question.answer === "yes_project") &&
      Boolean(question.evidence?.trim()),
    )
    .map((question) => ({ technology: question.technology, evidence: question.evidence!.trim() }));
}
