import { createHash } from "crypto";

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

export function applyTechAnswers(
  questions: TechQuestion[],
  answers: Array<{ id: string; answer: TechAnswerKind; evidence?: string }>,
): TechQuestion[] {
  const byId = new Map(answers.map((answer) => [answer.id, answer]));
  return questions.map((question) => {
    const answer = byId.get(question.id);
    if (!answer) return question;
    const isYes = answer.answer === "yes_professional" || answer.answer === "yes_project";
    return {
      ...question,
      answer: answer.answer,
      evidence: answer.evidence?.trim() || undefined,
      evidenceStatus: isYes
        ? "user_attested"
        : answer.answer === "no"
          ? "rejected"
          : "unanswered",
    };
  });
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
  return questions
    .filter((question) =>
      !question.answer ||
      question.answer === "no" ||
      question.answer === "not_sure" ||
      question.answer === "similar" ||
      question.evidenceStatus === "rejected" ||
      question.evidenceStatus === "unanswered" ||
      ((question.answer === "yes_professional" || question.answer === "yes_project") && !question.evidence?.trim()),
    )
    .map((question) => question.technology)
    .filter((technology) => !claimableTechnologies(questions).includes(technology));
}
