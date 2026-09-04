import { and, eq } from "drizzle-orm";
import { getDb } from "../database/client";
import * as s from "../database/schema";
import type { MemoryStoreLike, MistakeMemoryRuleRecord } from "../database/repositories";
import { newId, nowIso } from "../database/repositories";
import { mapMistakeMemory } from "../database/postgres-mappers";

export async function listActiveMistakeMemory(
  store: MemoryStoreLike,
  tenantId: string,
  applicationId: string,
): Promise<MistakeMemoryRuleRecord[]> {
  const db = getDb();
  if (db) {
    const rows = await db
      .select()
      .from(s.mistakeMemoryRules)
      .where(
        and(
          eq(s.mistakeMemoryRules.tenantId, tenantId),
          eq(s.mistakeMemoryRules.applicationId, applicationId),
          eq(s.mistakeMemoryRules.status, "active"),
          eq(s.mistakeMemoryRules.userOverride, false),
        ),
      );
    return rows.map(mapMistakeMemory);
  }

  return [...store.mistakeMemoryRules.values()].filter(
    (rule) =>
      rule.tenantId === tenantId &&
      rule.applicationId === applicationId &&
      rule.status === "active" &&
      !rule.userOverride,
  );
}

export async function addMistakeMemoryRule(
  store: MemoryStoreLike,
  input: Omit<MistakeMemoryRuleRecord, "id" | "publicId" | "createdAt" | "updatedAt"> & {
    publicId?: string;
  },
): Promise<MistakeMemoryRuleRecord> {
  const db = getDb();
  if (db) {
    const duplicate = (
      await db
        .select()
        .from(s.mistakeMemoryRules)
        .where(
          and(
            eq(s.mistakeMemoryRules.tenantId, input.tenantId),
            eq(s.mistakeMemoryRules.applicationId, input.applicationId),
            eq(s.mistakeMemoryRules.originatingAudit, input.originatingAudit as typeof s.mistakeMemoryRules.$inferInsert.originatingAudit),
            eq(s.mistakeMemoryRules.rule, input.rule),
          ),
        )
        .limit(1)
    )[0];
    if (duplicate) return mapMistakeMemory(duplicate);

    const row = (
      await db
        .insert(s.mistakeMemoryRules)
        .values({
          publicId: input.publicId ?? newId("mmp"),
          tenantId: input.tenantId,
          applicationId: input.applicationId,
          originatingAudit: input.originatingAudit as typeof s.mistakeMemoryRules.$inferInsert.originatingAudit,
          affectedVersion: input.affectedVersion,
          category: input.category,
          rule: input.rule,
          severity: input.severity as typeof s.mistakeMemoryRules.$inferInsert.severity,
          status: input.status,
          userOverride: input.userOverride,
          appliedIn: input.appliedIn,
        })
        .returning()
    )[0]!;
    return mapMistakeMemory(row);
  }

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
