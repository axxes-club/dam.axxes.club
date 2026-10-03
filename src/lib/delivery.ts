import { keyForUrl, storageAdapter, storageEnabled } from "./gcs/server";
import { UTApi } from "uploadthing/server";
import type { AssetRow } from "./db/schema";
type DeliveryDependencies = {
  enabled: () => boolean;
  keyForUrl: (url: string) => Promise<string | null>;
  read: (key: string) => Promise<string>;
  legacyUrl: (key: string) => Promise<string>;
  fetch: (url: string) => Promise<Response>;
};
const deliveryDependencies: DeliveryDependencies = {
  enabled: storageEnabled,
  keyForUrl,
  read: key => storageAdapter().read(null, key, async () => true),
  legacyUrl: async key => (await new UTApi().getSignedURL(key, { expiresIn: 60 })).ufsUrl,
  fetch: url => fetch(url, { cache: "no-store" }),
};
// Callers must authorize the asset/library and lifecycle before invoking byte delivery.
export async function deliverAsset(row: AssetRow, dependencies = deliveryDependencies): Promise<Response> {
  if (row.source === "url" && !row.storageKey) {
    const target = new URL(row.url);
    if (!["http:", "https:"].includes(target.protocol))
      return new Response(null, { status: 400 });
    return new Response(null, {
      status: 302,
      headers: {
        Location: target.toString(),
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (row.source !== "upload")
    return new Response("Storage protection pending", { status: 409 });
  const key = dependencies.enabled() ? await dependencies.keyForUrl(row.url) : null;
  if (!key && !row.storageKey)
    return new Response("Storage protection pending", { status: 409 });
  const target = key
    ? await dependencies.read(key)
    : await dependencies.legacyUrl(row.storageKey!);
  const upstream = await dependencies.fetch(target);
  if (!upstream.ok) return new Response(null, { status: 502 });
  const safeType = /^(image\/(png|jpeg|gif|webp|avif)|video\/|audio\/)/.test(
    row.mimeType ?? "",
  )
    ? row.mimeType!
    : "application/octet-stream";
  return new Response(upstream.body, {
    headers: {
      "Content-Type": safeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${safeType === "application/octet-stream" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.originalFilename ?? row.name)}`,
    },
  });
}
