import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { product } from "@/config/product";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 arc-bg text-center">
      <Logo size="lg" />
      <h1 className="mt-8 font-serif text-4xl tracking-tight sm:text-5xl">Page not found</h1>
      <p className="mt-3 max-w-md text-sm text-foreground-secondary">
        That route isn’t part of {product.name}. Head home or jump back into your applications.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonVariants()}>
          Marketing home
        </Link>
        <Link href="/app" className={cn(buttonVariants({ variant: "secondary" }))}>
          Open app
        </Link>
      </div>
    </div>
  );
}
