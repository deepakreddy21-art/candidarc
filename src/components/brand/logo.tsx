import { product } from "@/config/product";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  showWordmark = true,
  size = "md",
  /** Inverse: white wordmark + lime accent on forest/action green backgrounds */
  inverse = false,
}: {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
  inverse?: boolean;
}) {
  const dims = { sm: 22, md: 28, lg: 36 }[size];
  const arc = inverse ? "var(--lime)" : "var(--accent)";
  const arcSoft = inverse ? "color-mix(in oklab, var(--on-forest) 70%, transparent)" : "var(--accent)";
  const dot = inverse ? "var(--lime)" : "var(--accent)";
  const word = inverse ? "text-[var(--on-forest)]" : "text-foreground";

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <svg width={dims} height={dims} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M6 22C6 13.163 13.163 6 22 6" stroke={arc} strokeWidth="2.5" strokeLinecap="round" />
        <path
          d="M10 24C10 16.268 16.268 10 24 10"
          stroke={arcSoft}
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.85"
        />
        <circle cx="24.5" cy="7.5" r="2.5" fill={dot} />
      </svg>
      {showWordmark ? (
        <span className={cn("font-semibold tracking-tight", word, size === "lg" ? "text-xl" : "text-[15px]")}>
          {product.name}
        </span>
      ) : (
        <span className="sr-only">{product.name}</span>
      )}
    </div>
  );
}
