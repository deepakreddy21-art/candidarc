import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function VersionHistory({
  versions,
  currentId,
  onCompare,
}: {
  versions: Array<{ id: string; label: string; createdAt: string }>;
  currentId?: string;
  onCompare?: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Version history</CardTitle></CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {versions.map((version) => (
            <li key={version.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="font-medium">
                {version.label}
                {currentId === version.id ? " · current" : ""}
              </span>
              <span className="flex items-center gap-2">
                <time dateTime={version.createdAt} className="text-foreground-muted">{new Date(version.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
                {onCompare && currentId !== version.id ? (
                  <button type="button" className="text-accent hover:underline" onClick={() => onCompare(version.id)}>
                    Compare
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
