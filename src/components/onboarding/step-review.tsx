"use client";

import { Button } from "@/components/ui/button";
import { SENIORITY_OPTIONS, type OnboardingFormState } from "./types";

type Props = {
  form: OnboardingFormState;
  importStatus: string | null;
  onEditStep: (step: number) => void;
};

export function StepReview({ form, importStatus, onEditStep }: Props) {
  const seniority =
    SENIORITY_OPTIONS.find((option) => option.value === form.seniority)?.label ?? form.seniority;
  const profileStatus =
    importStatus === "confirmed"
      ? "Confirmed"
      : importStatus === "ready_for_review"
        ? "Ready to confirm"
        : form.careerProfileMode === "manual"
          ? "Manual entry"
          : "Not started";

  return (
    <div className="space-y-4">
      <ReviewCard title="Target roles" onEdit={() => onEditStep(0)}>
        <p>{form.targetRoles.join(", ") || "None"}</p>
        <p className="text-foreground-muted">Seniority: {seniority || "Not set"}</p>
        {form.targetCompanies.length ? (
          <p className="text-foreground-muted">Companies: {form.targetCompanies.join(", ")}</p>
        ) : null}
      </ReviewCard>

      <ReviewCard title="Work preferences" onEdit={() => onEditStep(1)}>
        <p>Types: {form.jobTypes.join(", ") || "None"}</p>
        <p>Workplace: {form.workplaceModes.join(", ") || "None"}</p>
        <p className="text-foreground-muted">
          Locations: {form.preferredLocations.join(", ") || "Any"}
        </p>
      </ReviewCard>

      <ReviewCard title="Career profile" onEdit={() => onEditStep(2)}>
        <p>Status: {profileStatus}</p>
        <p>Name: {form.fullName || "Not set"}</p>
        <p className="text-foreground-muted">
          Experience entries: {form.employment.filter((e) => e.title || e.company).length}
        </p>
        <p className="text-foreground-muted">Skills: {form.skills.slice(0, 8).join(", ") || "None yet"}</p>
      </ReviewCard>

      <div className="rounded-[16px] border border-border bg-surface-2/60 p-4 text-sm leading-relaxed text-foreground-secondary">
        When you choose a job, CandidArc analyzes its requirements and public company or team
        signals—such as likely technologies, initiatives and hiring patterns. Those signals help
        prioritize your real experience. They never become claims about you unless your career
        evidence supports them.
      </div>
    </div>
  );
}

function ReviewCard({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
      </div>
      <div className="space-y-1 text-sm text-foreground-secondary">{children}</div>
    </div>
  );
}
