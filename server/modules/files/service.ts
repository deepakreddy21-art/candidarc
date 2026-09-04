import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";
import type { FileRepository, Repositories } from "../../database/repositories";
import { newId } from "../../database/repositories";
import { AppError } from "../../domain/types";
import type { ObjectStorage } from "../../storage/types";
import type { QueueAdapter } from "../../workflows/queues";

const RETENTION_DAYS = 7;

export class FilesService {
  constructor(
    private readonly files: FileRepository,
    private readonly storage: ObjectStorage,
    private readonly queue: QueueAdapter,
  ) {}

  static fromRepos(repos: Repositories, storage: ObjectStorage, queue: QueueAdapter) {
    return new FilesService(repos.files, storage, queue);
  }

  private tenantId(ctx: AuthContext) {
    requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    return ctx.activeTenantId;
  }

  async registerUpload(
    ctx: AuthContext,
    input: {
      purpose: string;
      mimeType: string;
      size: number;
      checksum?: string;
      key?: string;
    },
  ) {
    const user = requireUser(ctx);
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);

    const storageKey = input.key ?? `uploads/${user.publicId}/${newId("file")}`;
    const signed = await this.storage.getSignedUploadUrl(tenantId, storageKey, { expiresInSeconds: 900 });

    const file = await this.files.create({
      id: newId("sf"),
      publicId: newId("sfp"),
      tenantId,
      ownerUserId: user.id,
      purpose: input.purpose,
      storageKey,
      mimeType: input.mimeType,
      size: input.size,
      checksum: input.checksum,
      scanStatus: "pending",
      retentionState: "active",
    });

    return { file, uploadUrl: signed.url, expiresAt: signed.expiresAt };
  }

  async signedDownload(ctx: AuthContext, filePublicId: string) {
    const tenantId = this.tenantId(ctx);
    const file = await this.files.getByPublicId(tenantId, filePublicId);
    if (!file) throw new AppError("FILE_NOT_FOUND", "File not found", 404);
    if (file.deletedAt) throw new AppError("FILE_DELETED", "File has been deleted", 410);

    const signed = await this.storage.getSignedDownloadUrl(tenantId, file.storageKey, { expiresInSeconds: 900 });
    return { file, downloadUrl: signed.url, expiresAt: signed.expiresAt };
  }

  async softDelete(ctx: AuthContext, filePublicId: string) {
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    const physicalDeleteAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const file = await this.files.softDelete(tenantId, filePublicId, physicalDeleteAt);

    await this.queue.enqueue(
      "maintenance",
      "files.physical_delete",
      {
        tenantId,
        filePublicId: file.publicId,
        storageKey: file.storageKey,
        physicalDeleteAt,
      },
      {
        delayMs: RETENTION_DAYS * 24 * 60 * 60 * 1000,
        idempotencyKey: `physical-delete:${file.publicId}`,
      },
    );

    return file;
  }
}
