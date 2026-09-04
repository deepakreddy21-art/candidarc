import { config } from "dotenv";
config();

async function main() {
  const { ensureDemoUser } = await import("../auth/demo-auth");
  const { seedDemoAppsIntoMemory } = await import("./seed-demo-apps");
  const { logger } = await import("../observability/logger");

  const { store, userId, tenantId } = await ensureDemoUser();
  seedDemoAppsIntoMemory(store, { tenantId, userId });
  logger.info({ tenantId, userId }, "demo apps seeded into memory store");
  console.log("Seed complete (memory). For postgres seeding, load SQL fixtures when available.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
