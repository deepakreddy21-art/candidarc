import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { product } from "@/config/product";

const sections = [
  { href: "/app/settings/profile", title: "Profile", description: "Name, contact, links, and career headline." },
  { href: "/app/settings/preferences", title: "Preferences", description: "Theme, resume defaults, and notification cadence." },
  { href: "/app/settings/privacy", title: "Privacy", description: "Exports, retention, evidence visibility, and account deletion." },
  { href: "/app/settings/billing", title: "Billing", description: "Plan, invoices, and seats for serious candidates." },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description={`Control how ${product.name} works for your applications.`} />
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.href} interactive>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={section.href} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Open
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
