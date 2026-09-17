import type { ReusableAnswer } from "./types";

export type SupportedAts = "greenhouse" | "lever" | "ashby";

export type MappedField = {
  intent: string;
  label: string;
  selector: string;
  value: string;
  sensitive: boolean;
  approved: boolean;
  fillable: boolean;
};

const SELECTORS: Record<SupportedAts, Record<string, string[]>> = {
  greenhouse: {
    full_name: ['input[name="job_application[first_name]"]', 'input[autocomplete="name"]'],
    email: ['input[name="job_application[email]"]', 'input[type="email"]'],
    phone: ['input[name="job_application[phone]"]', 'input[type="tel"]'],
    location: ['input[name="job_application[location]"]'],
    linkedin: ['input[name="job_application[linkedin]"]'],
    work_authorization: ['input[name*="work_authorized"]'],
    sponsorship: ['input[name*="sponsor"]', 'select[name*="sponsor"]'],
  },
  lever: {
    full_name: ['input[name="name"]', 'input[autocomplete="name"]'],
    email: ['input[name="email"]', 'input[type="email"]'],
    phone: ['input[name="phone"]'],
    location: ['input[name="location"]'],
    linkedin: ['input[name="urls[LinkedIn]"]'],
    work_authorization: ['input[name*="authorized"]'],
    sponsorship: ['input[name*="sponsor"]'],
  },
  ashby: {
    full_name: ['input[name="name"]', 'input[autocomplete="name"]'],
    email: ['input[name="email"]', 'input[type="email"]'],
    phone: ['input[name="phone"]'],
    location: ['input[name="location"]'],
    linkedin: ['input[name="linkedin"]'],
    work_authorization: ['input[name*="workAuthorization"]'],
    sponsorship: ['input[name*="sponsorship"]'],
  },
};

export function detectAts(host: string): SupportedAts | null {
  if (host.includes("greenhouse.io")) return "greenhouse";
  if (host === "jobs.lever.co" || host.includes("lever.co")) return "lever";
  if (host.includes("ashbyhq.com")) return "ashby";
  return null;
}

export function mapApprovedFields(
  answers: readonly ReusableAnswer[],
  ats: SupportedAts,
  opportunityId: string,
): MappedField[] {
  const selectors = SELECTORS[ats];
  return answers.flatMap((answer) => {
    const list = selectors[answer.intent];
    if (!list?.length) return [];
    const approved = !answer.requiresApproval || answer.approvedForOpportunityIds.includes(opportunityId);
    const fillable = approved && !answer.sensitive ? true : approved && answer.sensitive;
    return [
      {
        intent: answer.intent,
        label: answer.label,
        selector: list[0]!,
        value: String(answer.answer ?? ""),
        sensitive: answer.sensitive,
        approved,
        fillable: Boolean(fillable && answer.answer != null && answer.answer !== ""),
      },
    ];
  });
}

export function fieldsReadyToFill(fields: MappedField[]): MappedField[] {
  return fields.filter((field) => field.fillable && (!field.sensitive || field.approved));
}

export function unresolvedFields(fields: MappedField[]): MappedField[] {
  return fields.filter((field) => !field.fillable);
}
