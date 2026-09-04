import type { MemoryStoreLike, MistakeMemoryRuleRecord } from "../database/repositories";
import { newId, nowIso } from "../database/repositories";

export function listActiveMistakeMemory(
  store: MemoryStoreLike,
  tenantId: string,
  applicationId: string,
): MistakeMemoryRuleRecord[] {
  return [...store.mistakeMemoryRules.values()].filter(
    (rule) =>
      rule.tenantId === tenantId &&
      rule.applicationId === applicationId &&
      rule.status === "active" &&
      !rule.userOverride,
  );
}

export function addMistakeMemoryRule(
  store: MemoryStoreLike,
  input: Omit<MistakeMemoryRuleRecord, "id" | "publicId" | "createdAt" | "updatedAt"> & {
    publicId?: string;
  },
): MistakeMemoryRuleRecord {
  const duplicate = [...store.mistakeMemoryRules.values()].find(
    (rule) =>
      rule.tenantId === input.tenantId &&
      rule.applicationId === input.applicationId &&
      rule.originatingAudit === input.originatingAudit &&
      rule.rule === input.rule,
  );
  if (duplicate) return duplicate;
  const timestamp = nowIso();
  const record: MistakeMemoryRuleRecord = {
    ...input,
    id: newId("mm"),
    publicId: input.publicId ?? newId("mmp"),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.mistakeMemoryRules.set(record.id, record);
  return record;
}
