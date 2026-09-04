import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-[30px] font-semibold tracking-tight text-foreground sm:text-[32px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-foreground-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-foreground-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "neutral" | "accent" | "cyan" | "success" | "warning" | "destructive"> = {
    "final-qa": "cyan",
    ready: "success",
    auditing: "accent",
    researching: "warning",
    interviewing: "accent",
    archived: "neutral",
    verified: "success",
    inferred: "warning",
    critical: "destructive",
    major: "warning",
    minor: "neutral",
    suggestion: "cyan",
    accepted: "success",
    rejected: "destructive",
    open: "warning",
    completed: "success",
    pending: "neutral",
    "in-progress": "accent",
  };
  return <Badge tone={map[status] ?? "neutral"}>{status.replace(/-/g, " ")}</Badge>;
}
