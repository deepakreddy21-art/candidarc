import { config } from "dotenv";
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
  console.log("Postgres migrate: run drizzle-kit migrate or apply SQL from drizzle/ when ready.");
  console.log("(Phase 2 stub — schema is generated via npm run db:generate)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
