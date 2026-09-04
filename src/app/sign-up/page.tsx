"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { product } from "@/config/product";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 8) {
      toast.error("Add your name, email, and a password with at least 8 characters");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    toast.success("Account created");
    router.push("/onboarding");
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
          <h1 className="font-serif text-4xl tracking-tight">Build my application</h1>
          <p className="mt-2 text-sm text-foreground-secondary">
            Create your {product.name} account and set up the profile your resumes will learn from.
          </p>
        </div>
        <Card>
          <CardContent className="p-6">
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating…" : "Create account"}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-foreground-secondary">
              Already have an account?{" "}
              <Link href="/sign-in" className="font-medium text-accent hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
