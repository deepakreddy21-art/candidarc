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
  const word = inverse ? "text-[var(--on-forest)]" : "text-foreground";

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <span style={{ width: dims * 1.4, height: dims }} className="inline-flex items-center"><ArcMark inverse={inverse} className="h-full w-full" /></span>
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

export function ArcMark({ inverse = false, className }: { inverse?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 44" fill="none" aria-hidden>
      <path d="M2 40C7 17 19 5 34 5C49 5 59 19 62 40H47C45 24 39 17 30 17C19 17 11 25 7 40Z" fill={inverse ? "#fff" : "#19523b"} />
      <path d="M30 17C43 12 56 21 62 40H47C45 25 39 18 30 17Z" fill={inverse ? "#d4edb1" : "#a7d586"} />
    </svg>
  );
}
