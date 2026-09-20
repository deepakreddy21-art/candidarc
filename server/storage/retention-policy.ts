export type RetentionCandidate = { purpose: string; createdAt: string; size: number;
  referenced: boolean; protected: boolean; original: boolean; final: boolean; recovery: boolean };
/** Dry-run classification only. Unknown purposes are retained. No deletion side effect. */
export function retentionDecision(file: RetentionCandidate, now = Date.now()) {
  if (file.original || file.final || file.recovery || file.protected || file.referenced)
    return { action: "retain" as const, reason: "Protected or referenced data" };
  const days = file.purpose === "temporary-render" ? 7 : file.purpose === "abandoned-upload-part" ? 30 : null;
  if (days === null) return { action: "retain" as const, reason: "No approved temporary-data category" };
  const age = now - Date.parse(file.createdAt);
  return Number.isFinite(age) && age > days * 86400_000
    ? { action: "review" as const, reason: `Unreferenced temporary data older than ${days} days; operator review required` }
    : { action: "retain" as const, reason: "Inside retention period or unknown date" };
}
