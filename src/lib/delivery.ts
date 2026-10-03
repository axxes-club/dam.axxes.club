import { keyForUrl, storageAdapter, storageEnabled } from "./gcs/server";
import { UTApi } from "uploadthing/server";
import type { AssetRow } from "./db/schema";
type DeliveryDependencies = {
  enabled: () => boolean;
  keyForUrl: (url: string) => Promise<string | null>;
  read: (key: string) => Promise<string>;
  legacyUrl: (key: string) => Promise<string>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
};
const deliveryDependencies: DeliveryDependencies = {
  enabled: storageEnabled,
  keyForUrl,
  read: key => storageAdapter().read(null, key, async () => true),
  legacyUrl: async key => (await new UTApi().getSignedURL(key, { expiresIn: 60 })).ufsUrl,
  fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
};
// Callers must authorize the asset/library and lifecycle before invoking byte delivery.
export async function deliverAsset(row: AssetRow, dependencies = deliveryDependencies, request?: Request): Promise<Response> {
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
  const range = request?.headers.get("range");
  const upstream = await dependencies.fetch(target, range ? {headers:{Range:range}} : undefined);
  if (!upstream.ok) return new Response(null, { status: 502 });
  const extension=(row.originalFilename ?? row.name).split(".").pop()?.toLowerCase() ?? "";
  const inferred:Record<string,string>={pdf:"application/pdf",mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm",m4v:"video/mp4",ogv:"video/ogg",mp3:"audio/mpeg",m4a:"audio/mp4",aac:"audio/aac",wav:"audio/wav",ogg:"audio/ogg",flac:"audio/flac",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",avif:"image/avif"};
  const mime = row.mimeType || inferred[extension] || "";
  const safeType = /^(application\/pdf$|image\/(png|jpeg|gif|webp|avif)|video\/|audio\/)/.test(
    mime,
  )
    ? mime
    : "application/octet-stream";
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": safeType,
      ...Object.fromEntries(["Content-Range","Accept-Ranges","Content-Length"].flatMap(name=>{const value=upstream.headers.get(name);return value?[[name,value]]:[]})),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${safeType === "application/octet-stream" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.originalFilename ?? row.name)}`,
    },
  });
}
