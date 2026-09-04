import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "../config/env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | null = null;
let db: Db | null = null;

/**
 * Returns a Drizzle Postgres client when `CANDIDARC_DATA_MODE=postgres`.
 * In memory mode returns null — callers should use MemoryStore instead.
 */
export function getDb(): Db | null {
  const env = getEnv();
  if (env.CANDIDARC_DATA_MODE !== "postgres") {
    return null;
  }
  if (db) return db;
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when CANDIDARC_DATA_MODE=postgres");
  }
  client = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  db = drizzle(client, { schema });
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    db = null;
  }
}

export function resetDbCache(): void {
  client = null;
  db = null;
}
