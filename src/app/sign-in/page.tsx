"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { product } from "@/config/product";
import { cn } from "@/lib/utils";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Email and password are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Sign in failed");
      }
      toast.success(`Welcome back to ${product.name}`);
      router.push("/app");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-background arc-bg">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/">
          <Logo />
        </Link>
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16">
        <div className="mb-8">
          <h1 className="font-serif text-4xl tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-foreground-secondary">
            Continue building evidence-backed applications in {product.name}.
          </p>
        </div>
        <Card>
          <CardContent className="p-6">
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            {process.env.NEXT_PUBLIC_APP_MODE === "demo" ? (
              <p className="mt-3 text-center text-xs text-foreground-secondary">
                Demo account: deepak@candidarc.dev / CandidArc!Demo1
              </p>
            ) : null}
            <p className="mt-5 text-center text-sm text-foreground-secondary">
              New here?{" "}
              <Link href="/sign-up" className="font-medium text-accent hover:underline">
                Create an account
              </Link>
            </p>
            <Link href="/onboarding" className={cn(buttonVariants({ variant: "ghost" }), "mt-2 w-full")}>
              Continue onboarding
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
