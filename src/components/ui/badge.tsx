import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "cyan" | "success" | "warning" | "destructive";
}) {
  const tones = {
    neutral: "bg-surface-2 text-foreground-secondary border-border",
    accent: "bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-accent border-[color-mix(in_oklab,var(--accent)_24%,transparent)]",
    cyan: "bg-[color-mix(in_oklab,var(--cyan)_12%,transparent)] text-cyan border-[color-mix(in_oklab,var(--cyan)_24%,transparent)]",
    success:
      "bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-success border-[color-mix(in_oklab,var(--success)_24%,transparent)]",
    warning:
      "bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] text-warning border-[color-mix(in_oklab,var(--warning)_28%,transparent)]",
    destructive:
      "bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)] text-destructive border-[color-mix(in_oklab,var(--destructive)_24%,transparent)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
