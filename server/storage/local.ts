import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getEnv } from "../config/env";
import { logger } from "../observability/logger";
import type { ObjectMeta, ObjectStorage, PutObjectInput, SignedUrlOptions } from "./types";

type SignedPayload = {
  tenantId: string;
  key: string;
  exp: number;
  method: "GET" | "PUT";
};

function scopedKey(tenantId: string, key: string): string {
  const clean = key.replace(/^\/+/, "").replace(/\.\./g, "");
  return `${tenantId}/${clean}`;
}

export class LocalFilesystemStorage implements ObjectStorage {
  private root: string;
  private signingSecret: string;

  constructor(root = getEnv().STORAGE_LOCAL_PATH, signingSecret = getEnv().SESSION_SECRET) {
    this.root = path.resolve(root);
    this.signingSecret = signingSecret;
  }

  private abs(tenantId: string, key: string) {
    return path.join(this.root, scopedKey(tenantId, key));
  }

  private metaPath(tenantId: string, key: string) {
    return `${this.abs(tenantId, key)}.meta.json`;
  }

  async putObject(input: PutObjectInput): Promise<ObjectMeta> {
    const filePath = this.abs(input.tenantId, input.key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const body = typeof input.body === "string" ? Buffer.from(input.body) : Buffer.from(input.body);
    await fs.writeFile(filePath, body);
    const checksum = input.checksum ?? createHash("sha256").update(body).digest("hex");
    const meta: ObjectMeta = {
      key: input.key,
      tenantId: input.tenantId,
      size: body.byteLength,
      contentType: input.contentType,
      checksum,
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(this.metaPath(input.tenantId, input.key), JSON.stringify(meta), "utf8");
    return meta;
  }

  async getObject(tenantId: string, key: string) {
    try {
      const body = await fs.readFile(this.abs(tenantId, key));
      const meta = (await this.headObject(tenantId, key)) ?? {
        key,
        tenantId,
        size: body.byteLength,
        contentType: "application/octet-stream",
        createdAt: new Date().toISOString(),
      };
      return { body, meta };
    } catch {
      return null;
    }
  }

  async deleteObject(tenantId: string, key: string): Promise<void> {
    try {
      await fs.unlink(this.abs(tenantId, key));
    } catch {
      /* ignore missing */
    }
    try {
      await fs.unlink(this.metaPath(tenantId, key));
    } catch {
      /* ignore missing */
    }
  }

  async headObject(tenantId: string, key: string): Promise<ObjectMeta | null> {
    try {
      const raw = await fs.readFile(this.metaPath(tenantId, key), "utf8");
      return JSON.parse(raw) as ObjectMeta;
    } catch {
      try {
        const st = await fs.stat(this.abs(tenantId, key));
        return {
          key,
          tenantId,
          size: st.size,
          contentType: "application/octet-stream",
          createdAt: st.mtime.toISOString(),
        };
      } catch {
        return null;
      }
    }
  }

  async getSignedUploadUrl(tenantId: string, key: string, opts?: SignedUrlOptions) {
    return this.sign(tenantId, key, { ...opts, method: "PUT" });
  }

  async getSignedDownloadUrl(tenantId: string, key: string, opts?: SignedUrlOptions) {
    return this.sign(tenantId, key, { ...opts, method: "GET" });
  }

  async resolveSignedUrl(tokenizedPath: string, requestMethod?: string): Promise<{ tenantId: string; key: string; method: "GET" | "PUT" } | null> {
    try {
      const url = new URL(tokenizedPath, getEnv().APP_URL);
      const token = url.searchParams.get("token");
      if (!token) return null;
      const [payloadB64, sig] = token.split(".");
      if (!payloadB64 || !sig) return null;
      const expected = createHmac("sha256", this.signingSecret).update(payloadB64).digest("base64url");
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SignedPayload;
      if (payload.exp * 1000 < Date.now()) {
        logger.debug({ exp: payload.exp }, "signed url expired");
        return null;
      }
      const method = payload.method ?? "GET";
      if (requestMethod && requestMethod.toUpperCase() !== method) {
        logger.debug({ requestMethod, signedMethod: method }, "signed url method mismatch");
        return null;
      }
      return { tenantId: payload.tenantId, key: payload.key, method };
    } catch (err) {
      logger.debug({ err }, "signed url resolve failed");
      return null;
    }
  }

  private async sign(tenantId: string, key: string, opts?: SignedUrlOptions) {
    const expiresInSeconds = opts?.expiresInSeconds ?? 900;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const payload: SignedPayload = {
      tenantId,
      key,
      exp: Math.floor(expiresAt.getTime() / 1000),
      method: opts?.method ?? "GET",
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", this.signingSecret).update(payloadB64).digest("base64url");
    const nonce = randomBytes(4).toString("hex");
    const url = `${getEnv().APP_URL}/api/v1/files/signed/${nonce}?token=${payloadB64}.${sig}`;
    return { url, expiresAt: expiresAt.toISOString() };
  }
}
