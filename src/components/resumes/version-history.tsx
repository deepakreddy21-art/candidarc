import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function VersionHistory({ versions }: { versions: Array<{ id: string; label: string; createdAt: string }> }) {
  return (
    <Card>
      <CardHeader><CardTitle>Version history</CardTitle></CardHeader>
      <CardContent><ol className="space-y-3">{versions.map((version) => <li key={version.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"><span className="font-medium">{version.label}</span><time className="text-foreground-muted">{new Date(version.createdAt).toLocaleDateString()}</time></li>)}</ol></CardContent>
    </Card>
  );
}
