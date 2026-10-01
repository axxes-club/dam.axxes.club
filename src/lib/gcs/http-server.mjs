import { StorageError } from "./core.mjs";
async function jsonBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new StorageError("JSON body required");
  const parts = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256 * 1024) {
      await reader.cancel();
      throw new StorageError("Request too large", 413);
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new StorageError("Invalid JSON");
  }
}
export function handlers(
  adapter,
  { authorizeRead, authorizeDelete, resolveKey },
) {
  const wrap = (fn) => async (request) => {
    try {
      return await fn(request);
    } catch (e) {
      return Response.json(
        {
          error:
            e instanceof StorageError ? e.message : "Storage request failed",
        },
        {
          status: e instanceof StorageError ? e.status : 500,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  };
  return {
    POST: wrap(async (request) => {
      const body = await jsonBody(request);
      const result =
        body.action === "init"
          ? await adapter.init(request, body.route, body.files, body.input)
          : body.action === "complete"
            ? await adapter.complete(request, body.uploadId, body.input)
            : body.action === "renew"
              ? await adapter.renew(request, body.uploadId, body.input)
              : (() => {
                  throw new StorageError("Unknown upload action");
                })();
      return Response.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    }),
    GET: wrap(async (request) => {
      const key = await resolveKey(request);
      const url = await adapter.read(request, key, authorizeRead);
      return new Response(null, {
        status: 307,
        headers: {
          Location: url,
          "Cache-Control": "private, no-store",
          Vary: "Cookie, Authorization",
        },
      });
    }),
    DELETE: wrap(async (request) => {
      adapter.checkOrigin(request);
      const key = await resolveKey(request);
      const deleted = await adapter.remove(request, key, authorizeDelete);
      return Response.json(
        { deleted },
        { headers: { "Cache-Control": "no-store" } },
      );
    }),
  };
}
