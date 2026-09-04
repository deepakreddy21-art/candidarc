import { hashPassword } from "./password";
import type { MemoryStoreLike, Repositories } from "../database/repositories";
import { MemoryRepositories, newId, nowIso, createEmptyMemoryStore } from "../database/repositories";
import { logger } from "../observability/logger";

export const DEMO_USER = {
  email: "deepak@candidarc.dev",
  password: "CandidArc!Demo1",
  name: "Deepak Reddy Kilaru",
  userPublicId: "user_deepak",
  tenantPublicId: "ten_deepak",
} as const;

let cachedRepos: Repositories | null = null;
let cachedStore: MemoryStoreLike | null = null;

/**
 * Ensures the demo user/tenant exist for memory-mode login.
 * Prefer `server/database/seed.ts` when available; this is a self-contained fallback.
 */
export async function ensureDemoUser(store?: MemoryStoreLike): Promise<{
  repos: Repositories;
  store: MemoryStoreLike;
  userId: string;
  tenantId: string;
}> {
  const memory = store ?? cachedStore ?? createEmptyMemoryStore();
  cachedStore = memory;

  const repos = cachedRepos?.store === memory ? cachedRepos : new MemoryRepositories(memory);
  cachedRepos = repos;

  let user = await repos.users.findByEmail(DEMO_USER.email);
  if (!user) {
    for (const u of memory.users.values()) {
      if (u.publicId === DEMO_USER.userPublicId) {
        user = u;
        break;
      }
    }
  }

  if (!user) {
    const passwordHash = await hashPassword(DEMO_USER.password);
    user = await repos.users.create({
      id: newId("usr"),
      publicId: DEMO_USER.userPublicId,
      email: DEMO_USER.email,
      emailVerified: true,
      passwordHash,
      name: DEMO_USER.name,
    });
    logger.info({ userPublicId: user.publicId }, "demo user created");
  }

  let tenant = [...memory.tenants.values()].find((t) => t.publicId === DEMO_USER.tenantPublicId);
  if (!tenant) {
    tenant = {
      id: newId("ten"),
      publicId: DEMO_USER.tenantPublicId,
      name: "Deepak Personal",
      plan: "pro",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    memory.tenants.set(tenant.id, tenant);
  }

  const membershipExists = memory.memberships.some((m) => m.userId === user!.id && m.tenantId === tenant!.id);
  if (!membershipExists) {
    memory.memberships.push({
      id: newId("mem"),
      tenantId: tenant.id,
      userId: user.id,
      role: "owner",
      createdAt: nowIso(),
    });
  }

  return { repos, store: memory, userId: user.id, tenantId: tenant.id };
}

export function getDemoRepos(): Repositories | null {
  return cachedRepos;
}

export function setDemoStore(store: MemoryStoreLike) {
  cachedStore = store;
  cachedRepos = new MemoryRepositories(store);
}
