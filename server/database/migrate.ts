import { config } from "dotenv";
import { readdir, readFile } from "fs/promises";
import { resolve } from "path";
import postgres from "postgres";
config();

async function main() {
  const { getEnv } = await import("../config/env");
  const env = getEnv();
  if (env.CANDIDARC_DATA_MODE !== "postgres") {
    console.log("Skipping migrate: CANDIDARC_DATA_MODE is not postgres");
    return;
  }
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for migrate");
  }
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await sql`create table if not exists candidarc_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`;
    const directory = resolve(process.cwd(), "server/database/migrations");
    const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const applied = await sql`select 1 from candidarc_migrations where name = ${file}`;
      if (applied.length) continue;
      const source = await readFile(resolve(directory, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(source);
        await tx`insert into candidarc_migrations (name) values (${file})`;
      });
      console.log(`Applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
