import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Repositories } from "./repositories";
import { withTenant } from "./with-tenant";
import { getEnv } from "../config/env";

export type WorkKind = "profile" | "job" | "operation" | "export" | "research" | "edit" | "upload";
export type WorkRecord = { state: string; data: Record<string, unknown>; lease_token?: string | null; lease_until?: Date | string | null };
/** Canonical JSON hashes bind content rather than client-generated retry nonces. */
export function contentHash(value: unknown): string {
  const canonical = (v: unknown): unknown => v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(canonical)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
const memory = new WeakMap<object, Map<string, WorkRecord>>();
export class ResumeWorkStore {
  private readonly rows: Map<string, WorkRecord>;
  constructor(repos: Pick<Repositories, "store">, readonly tenantId: string, readonly ownerId: string) {
    let rows = memory.get(repos.store);
    if (!rows) { rows = new Map(); memory.set(repos.store, rows); }
    this.rows = rows;
  }
  private id(kind: WorkKind, key: string) { return JSON.stringify([this.tenantId, this.ownerId, kind, key]); }
  async get(kind: WorkKind, key: string): Promise<WorkRecord | null> {
    if (getEnv().CANDIDARC_DATA_MODE !== "postgres") return structuredClone(this.rows.get(this.id(kind, key)) ?? null);
    return withTenant(this.tenantId, async db => {
      const rows = await db.execute(sql`SELECT state,data,lease_token,lease_until FROM resume_work_records WHERE tenant_id=${this.tenantId}::uuid AND owner_user_id=${this.ownerId}::uuid AND kind=${kind} AND key=${key}`);
      return (rows[0] as WorkRecord | undefined) ?? null;
    });
  }
  async put(kind: WorkKind, key: string, data: Record<string, unknown>): Promise<WorkRecord> {
    if (getEnv().CANDIDARC_DATA_MODE !== "postgres") {
      const id = this.id(kind, key);
      if (!this.rows.has(id)) this.rows.set(id, { state: "ready", data: structuredClone(data) });
      return structuredClone(this.rows.get(id)!);
    }
    await withTenant(this.tenantId, db => db.execute(sql`INSERT INTO resume_work_records(tenant_id,owner_user_id,kind,key,data) VALUES(${this.tenantId}::uuid,${this.ownerId}::uuid,${kind},${key},${JSON.stringify(data)}::jsonb) ON CONFLICT DO NOTHING`));
    return (await this.get(kind, key))!;
  }
  /** Leases are only for repeatable LOCAL work. Provider allowances never expire or reset. */
  async claim(kind: WorkKind, key: string, ttlMs = 120_000): Promise<string | null> {
    const token = randomUUID();
    if (getEnv().CANDIDARC_DATA_MODE !== "postgres") {
      const row = this.rows.get(this.id(kind, key));
      if (!row || (row.lease_until && new Date(row.lease_until).getTime() > Date.now())) return null;
      row.lease_token = token; row.lease_until = new Date(Date.now() + ttlMs); return token;
    }
    return withTenant(this.tenantId, async db => {
      const rows = await db.execute(sql`UPDATE resume_work_records SET lease_token=${token},lease_until=now()+${ttlMs} * interval '1 millisecond' WHERE tenant_id=${this.tenantId}::uuid AND owner_user_id=${this.ownerId}::uuid AND kind=${kind} AND key=${key} AND (lease_until IS NULL OR lease_until < now()) RETURNING key`);
      return rows.length ? token : null;
    });
  }
  async renew(kind: WorkKind, key: string, token: string, ttlMs: number): Promise<boolean> {
    if (getEnv().CANDIDARC_DATA_MODE !== "postgres") {
      const row = this.rows.get(this.id(kind, key));
      if (row?.lease_token !== token) return false;
      row.lease_until = new Date(Date.now() + ttlMs); return true;
    }
    return withTenant(this.tenantId, async db => {
      const rows = await db.execute(sql`UPDATE resume_work_records SET lease_until=now()+${ttlMs} * interval '1 millisecond' WHERE tenant_id=${this.tenantId}::uuid AND owner_user_id=${this.ownerId}::uuid AND kind=${kind} AND key=${key} AND lease_token=${token} RETURNING key`);
      return rows.length > 0;
    });
  }
  async patch(kind: WorkKind, key: string, data: Record<string, unknown>, token?: string, state?: string): Promise<boolean> {
    if (getEnv().CANDIDARC_DATA_MODE !== "postgres") {
      const row = this.rows.get(this.id(kind, key));
      if (!row || (token && row.lease_token !== token)) return false;
      row.data = { ...row.data, ...structuredClone(data) }; if (state) row.state = state; return true;
    }
    return withTenant(this.tenantId, async db => {
      const rows = await db.execute(sql`UPDATE resume_work_records SET data=data || ${JSON.stringify(data)}::jsonb,state=coalesce(${state ?? null},state),updated_at=now() WHERE tenant_id=${this.tenantId}::uuid AND owner_user_id=${this.ownerId}::uuid AND kind=${kind} AND key=${key} ${token ? sql`AND lease_token=${token}` : sql``} RETURNING key`);
      return rows.length > 0;
    });
  }
  async release(kind: WorkKind, key: string, token: string) {
    if (getEnv().CANDIDARC_DATA_MODE !== "postgres") {
      const row = this.rows.get(this.id(kind, key));
      if (row?.lease_token === token) { row.lease_until = null; row.lease_token = null; } return;
    }
    await withTenant(this.tenantId, db => db.execute(sql`UPDATE resume_work_records SET lease_token=NULL,lease_until=NULL WHERE tenant_id=${this.tenantId}::uuid AND owner_user_id=${this.ownerId}::uuid AND kind=${kind} AND key=${key} AND lease_token=${token}`));
  }
}
