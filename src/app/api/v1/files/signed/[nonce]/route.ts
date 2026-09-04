import { getStorage } from "@server/storage";
import { jsonError } from "@server/http/response";
import { AppError } from "@server/domain/types";

export async function GET(request: Request) {
  return handleSigned(request);
}

export async function PUT(request: Request) {
  return handleSigned(request, true);
}

async function handleSigned(request: Request, isUpload = false) {
  try {
    const storage = getStorage();
    const resolved = await storage.resolveSignedUrl(request.url, request.method);
    if (!resolved) throw new AppError("INVALID_SIGNED_URL", "Invalid or expired signed URL", 403);
    if (isUpload && resolved.method !== "PUT") {
      throw new AppError("INVALID_SIGNED_URL", "Signed URL method mismatch", 403);
    }
    if (!isUpload && resolved.method !== "GET") {
      throw new AppError("INVALID_SIGNED_URL", "Signed URL method mismatch", 403);
    }

    if (isUpload) {
      const body = Buffer.from(await request.arrayBuffer());
      await storage.putObject({
        tenantId: resolved.tenantId,
        key: resolved.key,
        body,
        contentType: request.headers.get("content-type") || "application/octet-stream",
      });
      return new Response(null, { status: 204 });
    }

    const object = await storage.getObject(resolved.tenantId, resolved.key);
    if (!object) throw new AppError("FILE_NOT_FOUND", "Object not found", 404);
    return new Response(new Uint8Array(object.body), {
      status: 200,
      headers: {
        "Content-Type": object.meta.contentType,
        "Content-Length": String(object.body.byteLength),
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
