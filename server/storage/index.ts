import { getEnv } from "../config/env";
import { LocalFilesystemStorage } from "./local";
import { S3ObjectStorage } from "./s3";
import type { ObjectStorage } from "./types";

let storage: ObjectStorage | null = null;

export function getStorage(): ObjectStorage {
  if (storage) return storage;
  const env = getEnv();
  if (env.STORAGE_DRIVER === "s3") {
    storage = new S3ObjectStorage();
  } else {
    storage = new LocalFilesystemStorage(env.STORAGE_LOCAL_PATH);
  }
  return storage;
}

export function resetStorage() {
  storage = null;
}

export type { ObjectStorage, ObjectMeta, PutObjectInput } from "./types";
export { LocalFilesystemStorage } from "./local";
export { S3ObjectStorage, createS3ClientFromConfig } from "./s3";
