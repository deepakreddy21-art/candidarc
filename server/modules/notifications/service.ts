import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../../database/client";
import { getMemoryStore } from "../../database/memory-store";
import { notifications } from "../../database/schema";
import { newId } from "../../database/repositories";
import { AppError } from "../../domain/types";
import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireUser } from "../../auth/guards";

export type NotificationDto = {
  id: string;
  title: string;
  body: string;
  href?: string;
  tone: "info" | "success" | "warning";
  read: boolean;
  createdAt: string;
};

function toneOf(value: string): NotificationDto["tone"] {
  if (value === "success" || value === "warning") return value;
  return "info";
}

export class NotificationsService {
  private tenantId(ctx: AuthContext) {
    const user = requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    void user;
    return ctx.activeTenantId;
  }

  async list(ctx: AuthContext): Promise<NotificationDto[]> {
    const user = requireUser(ctx);
    const tenantId = this.tenantId(ctx);
    const db = getDb();
    if (db) {
      const rows = await db
        .select()
        .from(notifications)
        .where(
          and(eq(notifications.tenantId, tenantId), eq(notifications.userId, user.id), isNull(notifications.deletedAt)),
        )
        .orderBy(desc(notifications.createdAt))
        .limit(100);
      return rows.map((row) => ({
        id: row.publicId,
        title: row.title,
        body: row.body,
        href: row.href ?? undefined,
        tone: toneOf(row.tone),
        read: row.read,
        createdAt: row.createdAt.toISOString(),
      }));
    }
    return getMemoryStore()
      .listNotifications(tenantId, user.id)
      .map((row) => ({
        id: row.publicId,
        title: row.title,
        body: row.body,
        href: row.href ?? undefined,
        tone: toneOf(row.tone),
        read: row.read,
        createdAt: row.createdAt.toISOString(),
      }));
  }

  async markRead(ctx: AuthContext, publicId: string): Promise<void> {
    const user = requireUser(ctx);
    const tenantId = this.tenantId(ctx);
    const db = getDb();
    if (db) {
      await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.tenantId, tenantId),
            eq(notifications.userId, user.id),
            eq(notifications.publicId, publicId),
          ),
        );
      return;
    }
    getMemoryStore().markNotificationRead(tenantId, user.id, publicId);
  }

  async create(
    tenantId: string,
    userId: string,
    input: { title: string; body: string; href?: string; tone?: NotificationDto["tone"] },
  ): Promise<void> {
    const db = getDb();
    if (db) {
      await db.insert(notifications).values({
        publicId: newId("ntf"),
        tenantId,
        userId,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
        tone: input.tone ?? "info",
        read: false,
      });
      return;
    }
    getMemoryStore().addNotification({
      publicId: newId("ntf"),
      tenantId,
      userId,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      tone: input.tone ?? "info",
      read: false,
    });
  }
}
