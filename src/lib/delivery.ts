import { UTApi } from "uploadthing/server";
import type { AssetRow } from "./db/schema";
export async function deliverAsset(row: AssetRow): Promise<Response> {
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
  if (row.source !== "upload" || !row.storageKey)
    return new Response("Storage protection pending", { status: 409 });
  const signed = await new UTApi().getSignedURL(row.storageKey, {
    expiresIn: 60,
  });
  const upstream = await fetch(signed.ufsUrl, { cache: "no-store" });
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
