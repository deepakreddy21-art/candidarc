export type ObjectMeta = {
  key: string;
  tenantId: string;
  size: number;
  contentType: string;
  checksum?: string;
  createdAt: string;
};

export type PutObjectInput = {
  tenantId: string;
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  checksum?: string;
};

export type SignedUrlOptions = {
  expiresInSeconds?: number;
  method?: "GET" | "PUT";
};

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<ObjectMeta>;
  getObject(tenantId: string, key: string): Promise<{ body: Buffer; meta: ObjectMeta } | null>;
  deleteObject(tenantId: string, key: string): Promise<void>;
  headObject(tenantId: string, key: string): Promise<ObjectMeta | null>;
  getSignedUploadUrl(tenantId: string, key: string, opts?: SignedUrlOptions): Promise<{ url: string; expiresAt: string }>;
  getSignedDownloadUrl(tenantId: string, key: string, opts?: SignedUrlOptions): Promise<{ url: string; expiresAt: string }>;
  resolveSignedUrl(tokenizedPath: string): Promise<{ tenantId: string; key: string } | null>;
}
