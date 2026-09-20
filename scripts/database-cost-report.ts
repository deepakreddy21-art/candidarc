/** Operator-run, read-only measurements; no production row contents or secret URLs printed. */
import postgres from "postgres";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be configured");
const db = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const sizes = await db`select relname, n_live_tup as estimated_rows,
    pg_relation_size(relid) as table_bytes, pg_indexes_size(relid) as index_bytes
    from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 30`;
  const connections = await db`select application_name, state, count(*) from pg_stat_activity
    where datname=current_database() group by application_name,state`;
  const [tenant, owner, key] = process.argv.slice(2);
  const plan = tenant && owner && key ? await db.begin(async tx => {
    await tx`select set_config('app.tenant_id',${tenant},true)`;
    return tx`explain (format json) select state,data from resume_work_records
      where tenant_id=${tenant}::uuid and owner_user_id=${owner}::uuid and kind='operation' and key=${key}`;
  }) : "Supply tenant, owner and an operation key to inspect its plan (EXPLAIN only).";
  console.log(JSON.stringify({ sizes, connections, plan }, null, 2));
} finally { await db.end(); }
