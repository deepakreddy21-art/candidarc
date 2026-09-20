/** Read-only bounded report. Intentionally has no --apply or deletion implementation. */
import postgres from "postgres";
import { retentionDecision } from "../server/storage/retention-policy";
const [tenant, owner] = process.argv.slice(2);
if (!tenant || !owner || !process.env.DATABASE_URL) throw new Error("Usage: DATABASE_URL=<configured> npx tsx scripts/storage-retention-report.ts <tenant UUID> <owner UUID>");
const db = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const rows = await db.begin(async tx => {
    await tx`select set_config('app.tenant_id', ${tenant}, true)`;
    return tx`select f.public_id, f.purpose, f.size, f.created_at,
      (exists(select 1 from candidate_profiles p where p.tenant_id=f.tenant_id and p.source_resume_file_public_id=f.public_id)
       or exists(select 1 from applications a where a.tenant_id=f.tenant_id and a.metadata::text like '%' || f.public_id || '%')
       or exists(select 1 from resume_work_records w where w.tenant_id=f.tenant_id and (w.data::text like '%' || f.public_id || '%' or w.data::text like '%' || f.storage_key || '%'))) as referenced
      from stored_files f where f.tenant_id=${tenant}::uuid and f.owner_user_id=${owner}::uuid
      order by f.created_at, f.public_id limit 100`;
  });
  console.log(JSON.stringify({ dryRun: true, truncatedAt: 100, records: rows.map(row => ({
    fileId: row.public_id, bytes: row.size, ...retentionDecision({ purpose: row.purpose,
      createdAt: new Date(row.created_at).toISOString(), size: row.size, referenced: row.referenced,
      original: row.purpose === "resume-import", final: row.purpose.startsWith("customer-resume-"),
      protected: !["temporary-render", "abandoned-upload-part"].includes(row.purpose), recovery: false }),
  })) }, null, 2));
} finally { await db.end(); }
