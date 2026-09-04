import { getRuntime } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonError } from "@server/http/response";
import { requireUser, requireApplicationAccess } from "@server/auth/guards";

type Params = { params: Promise<{ applicationId: string }> };

export async function GET(request: Request, { params }: Params) {
  let requestId = "";
  try {
    const { applicationId } = await params;
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    await requireApplicationAccess(ctx, applicationId);
    const runtime = await getRuntime();

    const lastEventIdHeader = request.headers.get("Last-Event-ID");
    let sinceSeq = lastEventIdHeader ? Number(lastEventIdHeader) || 0 : 0;
    const url = new URL(request.url);
    const sinceParam = url.searchParams.get("sinceSeq");
    if (sinceParam) sinceSeq = Math.max(sinceSeq, Number(sinceParam) || 0);

    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown, id?: number) => {
          if (closed) return;
          let chunk = "";
          if (id !== undefined) chunk += `id: ${id}\n`;
          chunk += `event: ${event}\n`;
          chunk += `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        };

        send("ready", { applicationId, sinceSeq });

        const heartbeat = setInterval(() => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          } catch {
            closed = true;
            clearInterval(heartbeat);
          }
        }, 15_000);

        const poll = setInterval(async () => {
          if (closed) return;
          try {
            const runs = await runtime.services.workflows.listByApplication(ctx, applicationId);
            const run = runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
            if (!run) return;
            const events = await runtime.services.workflows.listEvents(ctx, run.publicId, sinceSeq);
            for (const e of events) {
              sinceSeq = Math.max(sinceSeq, e.seq);
              send(
                "workflow",
                {
                  id: e.publicId,
                  seq: e.seq,
                  stage: e.stage,
                  status: e.status,
                  message: e.message,
                  createdAt: e.createdAt,
                  metadata: e.metadata,
                },
                e.seq,
              );
            }
          } catch {
            // keep stream alive
          }
        }, 1000);

        request.signal.addEventListener("abort", () => {
          closed = true;
          clearInterval(heartbeat);
          clearInterval(poll);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
      cancel() {
        closed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Request-Id": requestId,
      },
    });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
