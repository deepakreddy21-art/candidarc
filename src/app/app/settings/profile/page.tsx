"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/services/api";
import type { CandidateProfile } from "@/types/domain";

export default function ProfileSettingsPage() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);

  useEffect(() => {
    void api.getProfile().then(setProfile);
  }, []);

  if (!profile) return <p className="text-sm text-foreground-muted">Loading profile…</p>;

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="This master profile seeds each new application." />
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          {(
            [
              ["fullName", "Full name"],
              ["preferredName", "Preferred name"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["location", "Location"],
              ["linkedIn", "LinkedIn"],
              ["github", "GitHub"],
              ["portfolio", "Portfolio"],
              ["headline", "Headline"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                value={String(profile[key] ?? "")}
                onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="summary">Summary</Label>
            <Textarea
              id="summary"
              value={profile.summary}
              onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              onClick={async () => {
                await api.updateProfile(profile);
                toast.success("Profile saved");
              }}
            >
              Save profile
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3" aria-label="Career Truth">
        {[
          ["Identity", "Your verified name, contact details, headline, and professional links."],
          ["Preferences", `${profile.targetRoleFamilies.join(", ")} · ${profile.preferredResumeLength}`],
          ["Eligibility", "Work authorization and sponsorship answers are sensitive and require approval per application."],
        ].map(([title, description]) => (
          <Card key={title}>
            <CardContent className="p-5">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-foreground-secondary">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
