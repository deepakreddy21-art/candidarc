import { sql } from "drizzle-orm";
import { getDb } from "./client";

export async function withTenant<T>(tenantId: string, work: (tx: NonNullable<ReturnType<typeof getDb>>) => Promise<T>): Promise<T> {
  const db = getDb();
  if (!db) throw new Error("withTenant requires PostgreSQL mode");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return work(tx as NonNullable<ReturnType<typeof getDb>>);
  });
}
