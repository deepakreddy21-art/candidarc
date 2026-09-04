import { createHash } from "crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "../config/env";
import type { ObjectMeta, ObjectStorage, PutObjectInput, SignedUrlOptions } from "./types";

function scopedKey(tenantId: string, key: string): string {
  const clean = key.replace(/^\/+/, "").replace(/\.\./g, "");
  return `${tenantId}/${clean}`;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body);
  if (body && typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return Buffer.alloc(0);
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    bucket = getEnv().S3_BUCKET,
    region = getEnv().S3_REGION,
    endpoint = getEnv().S3_ENDPOINT,
    accessKeyId = getEnv().S3_ACCESS_KEY,
    secretAccessKey = getEnv().S3_SECRET_KEY,
  ) {
    this.bucket = bucket;
    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: Boolean(endpoint),
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  private objectKey(tenantId: string, key: string) {
    return scopedKey(tenantId, key);
  }

  async putObject(input: PutObjectInput): Promise<ObjectMeta> {
    const objectKey = this.objectKey(input.tenantId, input.key);
    const body = typeof input.body === "string" ? Buffer.from(input.body) : Buffer.from(input.body);
    const checksum = input.checksum ?? createHash("sha256").update(body).digest("hex");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: input.contentType,
        Metadata: {
          checksum,
        },
      }),
    );
    return {
      key: input.key,
      tenantId: input.tenantId,
      size: body.byteLength,
      contentType: input.contentType,
      checksum,
      createdAt: new Date().toISOString(),
    };
  }

  async getObject(tenantId: string, key: string) {
    try {
      const objectKey = this.objectKey(tenantId, key);
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );
      const body = await bodyToBuffer(response.Body);
      const meta = (await this.headObject(tenantId, key)) ?? {
        key,
        tenantId,
        size: body.byteLength,
        contentType: response.ContentType ?? "application/octet-stream",
        createdAt: new Date().toISOString(),
      };
      return { body, meta };
    } catch {
      return null;
    }
  }

  async deleteObject(tenantId: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(tenantId, key),
      }),
    );
  }

  async headObject(tenantId: string, key: string): Promise<ObjectMeta | null> {
    try {
      const objectKey = this.objectKey(tenantId, key);
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );
      return {
        key,
        tenantId,
        size: response.ContentLength ?? 0,
        contentType: response.ContentType ?? "application/octet-stream",
        checksum: response.Metadata?.checksum,
        createdAt: response.LastModified?.toISOString() ?? new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  async getSignedUploadUrl(tenantId: string, key: string, opts?: SignedUrlOptions) {
    const expiresIn = opts?.expiresInSeconds ?? 900;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.objectKey(tenantId, key),
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }

  async getSignedDownloadUrl(tenantId: string, key: string, opts?: SignedUrlOptions) {
    const expiresIn = opts?.expiresInSeconds ?? 900;
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.objectKey(tenantId, key),
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }

  async resolveSignedUrl(tokenizedPath: string, requestMethod?: string) {
    void tokenizedPath;
    void requestMethod;
    return null;
  }
}

export function createS3ClientFromConfig(config?: {
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}) {
  return new S3ObjectStorage(
    config?.bucket,
    config?.region,
    config?.endpoint,
    config?.accessKeyId,
    config?.secretAccessKey,
  );
}
