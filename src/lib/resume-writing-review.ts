import policy from "../../services/python-backend/app/prompts/resume-writing-policy.json";

export type WritingCriterion = "repetition" | "action_verbs" | "specifics" | "avoided_words" | "length" | "analytical" | "communication" | "leadership" | "teamwork" | "initiative";
export type WritingFinding = {
  criterion: WritingCriterion;
  sectionId: string;
  section: string;
  item?: string;
  bulletIndex?: number;
  text: string;
  message: string;
};
export type WritingReview = {
  rubricVersion: string;
  bulletCount: number;
  criteria: Array<{ id: WritingCriterion; label: string; status: "clear" | "suggestion" | "signal_found" | "not_observed" | "not_evaluated"; detail: string }>;
  findings: WritingFinding[];
};

type Row = Record<string, unknown>;
export type ReviewBullet = Omit<WritingFinding, "criterion" | "message"> & { source: Row };
const row = (value: unknown): Row => value && typeof value === "object" ? value as Row : {};
const string = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const normalize = (text: string): string => text.toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}+#.]+/gu, " ").trim();
const words = (text: string): string[] => normalize(text).split(/\s+/).filter(Boolean);
const preferred = new Set(policy.preferredVerbs);
const fallback = new Set(policy.fallbackVerbs);

/** Mirror the rendered structure: do not count section-level mirrors twice. */
export function collectReviewBullets(sections: Row[]): ReviewBullet[] {
  return sections.flatMap((section, sectionIndex) => {
    const location = { sectionId: string(section.id) || `section-${sectionIndex}`, section: string(section.title) || string(section.type) || "Section" };
    const read = (bullets: unknown[], item?: string) => bullets.flatMap((bullet, bulletIndex) => {
      const text = typeof bullet === "string" ? bullet.trim() : string(row(bullet).text);
      return text ? [{ ...location, item, bulletIndex, text, source: row(bullet) }] : [];
    });
    const items = list(section.items).map(row);
    const itemBullets = items.flatMap((item) => read(list(item.bullets), [string(item.heading), string(item.subheading)].filter(Boolean).join(" · ")));
    const mirrored = new Set(itemBullets.map((bullet) => normalize(bullet.text)));
    return [...read(list(section.bullets)).filter((bullet) => !mirrored.has(normalize(bullet.text))), ...itemBullets];
  });
}

// Numbers must describe scope, outcome, time, or money. Python 3.12 / Java 21 /
// ISO 27001 / a year on their own do not satisfy this signal.
const quantity = "(?:\\d[\\d,]*(?:\\.\\d+)?(?:[kmb])?\\+?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundred|thousand|million|billion)";
const metric = new RegExp(`(?:[$€£]\\s*${quantity}|\\b${quantity}\\s*(?:%|percent\\b)|\\b${quantity}\\s+(?:million\\s+|billion\\s+)?(?:users?|customers?|patients?|students?|clients?|services?|requests?|transactions?|departments?|teams?|engineers?|employees?|people|sites?|locations?|projects?|accounts?|reports?|hours?|minutes?|seconds?|milliseconds?|days?|weeks?|months?|dollars?|euros?|pounds?)\\b)`, "i");
const technologyVersion = /\b(?:java|python|node(?:\.js)?|react|angular|spring(?: boot)?|\.net|windows|iso|soc|c\+\+)\s+v?\d+(?:\.\d+)*/gi;
const qualitativeOutcome = /\b(?:to|for)\s+(?:reduce|improve|prevent|support|enable|simplify|restore|resolve)\b|\b(?:reduced|improved|prevented|enabled|eliminated|restored|resolved|accelerated|streamlined)\b/i;
const filler = /\b(responsible for|duties included|worked on|helped with|in order to|various|numerous|results[- ]driven|go[- ]getter|leveraged synergies)\b/i;
const pronouns = /\b(?:I(?![/-])|I'm|I've|[Ww]e|[Oo]ur|[Mm]y|[Mm]yself|[Oo]urselves)\b/;
const passive = /\b(?:was|were|been)\s+(?:implemented|designed|developed|created|completed|managed|delivered|performed)\b/i;

export function reviewResumeWriting(input: { sections: Row[]; pageCount?: number; preferredLength?: string }): WritingReview {
  const professional = input.sections.filter((section) => ["experience", "projects"].includes(string(section.type)));
  const bullets = collectReviewBullets(professional);
  const findings: WritingFinding[] = [];
  const add = (criterion: WritingCriterion, bullet: ReviewBullet, message: string) => {
    const { source: _source, ...location } = bullet;
    void _source;
    findings.push({ ...location, criterion, message });
  };
  const openers = new Map<string, ReviewBullet[]>();
  const sentences = new Map<string, ReviewBullet[]>();
  const phrases = new Map<string, ReviewBullet[]>();
  for (const bullet of bullets) {
    const tokens = words(bullet.text);
    const opening = tokens[0] ?? "";
    if (preferred.has(opening) || fallback.has(opening)) {
      openers.set(opening, [...(openers.get(opening) ?? []), bullet]);
    }
    if (fallback.has(opening)) {
      add("action_verbs", bullet, `“${opening}” is a familiar opening. Prefer a more precise action verb if it preserves what you actually did; otherwise keep it.`);
    } else if (!preferred.has(opening)) {
      add("action_verbs", bullet, "Check the opening: use a precise action you performed. An unrecognized verb may still be appropriate; do not imply greater ownership.");
    }
    const key = normalize(bullet.text);
    sentences.set(key, [...(sentences.get(key) ?? []), bullet]);
    // Repeated opening phrases signal repetitive prose without penalizing words
    // such as Python or PostgreSQL appearing in different achievements.
    if (tokens.length >= 5 && (preferred.has(opening) || fallback.has(opening))) {
      const phrase = tokens.slice(0, 5).join(" ");
      phrases.set(phrase, [...(phrases.get(phrase) ?? []), bullet]);
    }
    if (!metric.test(bullet.text.replace(technologyVersion, "")) && !qualitativeOutcome.test(bullet.text)) {
      add("specifics", bullet, "Consider explaining the outcome or scope. Add a number only if you can substantiate it; a clear qualitative result is also useful.");
    }
    if (filler.test(bullet.text) || pronouns.test(bullet.text) || passive.test(bullet.text)) {
      add("avoided_words", bullet, "Review possible filler, personal pronouns, or passive wording. Keep meaningful context and distinguish your contribution from the team's.");
    }
    if (tokens.length > 40) add("length", bullet, "This bullet exceeds 40 words. Consider removing repetition or splitting distinct achievements; preserve the facts.");
  }
  const repetitionRows = new Set<ReviewBullet>();
  for (const [opening, rows] of openers) {
    if (rows.length < 3) continue;
    for (const bullet of rows) {
      repetitionRows.add(bullet);
      add("repetition", bullet, `${rows.length} bullets begin with “${opening}”. Vary the opening where the meaning allows; retain necessary technical keywords.`);
    }
  }
  for (const [text, rows] of [...sentences, ...phrases]) {
    if (rows.length < 2) continue;
    for (const bullet of rows) {
      if (repetitionRows.has(bullet)) continue;
      repetitionRows.add(bullet);
      add("repetition", bullet, `Repeated wording: “${text}”. Check for duplicate achievements or use distinct, accurate descriptions.`);
    }
  }

  // Summary wording is reviewed too, but not forced into an action-bullet form.
  for (const [index, section] of input.sections.entries()) {
    if (!["summary", "experience", "projects"].includes(string(section.type))) continue;
    const text = string(section.content);
    if (text && (filler.test(text) || pronouns.test(text) || passive.test(text))) {
      findings.push({ criterion: "avoided_words", sectionId: string(section.id) || `section-${index}`, section: string(section.title) || string(section.type), text, message: "Review filler or personal phrasing; retain specific, relevant context." });
    }
  }
  const measured = typeof input.pageCount === "number" && Number.isInteger(input.pageCount) && input.pageCount > 0;
  const limit = input.preferredLength === "one-page" ? 1 : 2;
  const tooLong = measured && input.pageCount! > limit;
  const criteria: WritingReview["criteria"] = ([
    ["repetition", "Repetition"], ["action_verbs", "Action verbs"], ["specifics", "Outcomes and scope"], ["avoided_words", "Direct language"], ["length", "Length and relevance"],
  ] as const).map(([id, label]) => {
    const count = findings.filter((finding) => finding.criterion === id).length;
    return {
      id, label,
      status: count || (id === "length" && tooLong) ? "suggestion" : bullets.length ? "clear" : "not_evaluated",
      detail: id === "length"
        ? `${measured ? `${input.pageCount} rendered PDF page(s); ${limit}-page review target.` : "PDF page count not measured yet."} ${count ? `${count} long bullet(s). ` : ""}Prioritize relevance; never shrink text or discard stored profile details to fit.`
        : bullets.length ? `${count} wording suggestion(s). Automated signals require your judgment.` : "No experience or project bullets to evaluate.",
    };
  });
  for (const competency of policy.competencies) {
    const pattern = new RegExp(competency.pattern, "i");
    const matches = bullets.filter((bullet) => pattern.test(bullet.text));
    criteria.push({
      id: competency.id as WritingCriterion, label: competency.label,
      status: !bullets.length ? "not_evaluated" : matches.length ? "signal_found" : "not_observed",
      detail: matches.length ? `Possible examples in ${matches.length} bullet(s); wording alone does not prove the competency.` : competency.guidance,
    });
  }
  return { rubricVersion: policy.version, bulletCount: bullets.length, criteria, findings };
}
