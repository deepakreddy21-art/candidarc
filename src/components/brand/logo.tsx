import { product } from "@/config/product";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  showWordmark = true,
  size = "md",
  /** Inverse: white wordmark on forest/action backgrounds */
  inverse = false,
}: {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
  inverse?: boolean;
}) {
  const dims = { sm: 22, md: 26, lg: 32 }[size];
  const stroke = inverse ? "var(--on-forest)" : "var(--foreground)";
  const word = inverse ? "text-[var(--on-forest)]" : "text-foreground";

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <svg width={dims} height={dims} viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M7 23C7 14.163 14.163 7 23 7" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        <path
          d="M11 25C11 17.268 17.268 11 25 11"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.45"
        />
        <circle cx="24.5" cy="8" r="2.2" fill={inverse ? "var(--fresh)" : "var(--headline)"} />
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
