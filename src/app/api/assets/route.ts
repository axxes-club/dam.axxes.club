import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { guard, jsonError } from "@/lib/api";
import { assetTypeOf, normalizeFolder, toAsset } from "@/lib/assets";
import { queryAssets } from "@/lib/queries";
import type { AssetSort, AssetType } from "@/lib/types";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const access = await guard(req.headers, params.get("tenantId"));
  if ("error" in access) return access.error;

  const page = await queryAssets(access.tenant.id, {
    q: params.get("q") ?? undefined,
    type: params.get("type") as AssetType | null,
    folder: params.get("folder"),
    sort: (params.get("sort") as AssetSort | null) ?? undefined,
    offset: Number(params.get("offset")) || 0,
  });
  return NextResponse.json(page);
}

// Add a file by URL; the file stays where it is hosted
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const access = await guard(req.headers, body?.tenantId, "write");
  if ("error" in access) return access.error;

  let url: URL;
  try {
    url = new URL(String(body?.url ?? "").trim());
  } catch {
    return jsonError("Enter a valid URL", 400);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return jsonError("Only http(s) links are supported", 400);

  let mimeType: string | null = null;
  let fileSize: number | null = null;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
    mimeType = res.headers.get("content-type")?.split(";")[0].trim() || null;
    const length = Number(res.headers.get("content-length"));
    fileSize = Number.isFinite(length) && length > 0 && length < 2 ** 31 ? length : null;
  } catch {}
  if (!mimeType || mimeType === "application/octet-stream") mimeType = guessMime(url.pathname) ?? mimeType;

  const filename = decodeURIComponent(url.pathname.split("/").pop() || "") || url.hostname;
  const name = (String(body?.name ?? "").trim() || filename.replace(/\.[^.]+$/, "") || filename).slice(0, 255);

  const [row] = await db
    .insert(assets)
    .values({
      tenantId: access.tenant.id,
      name,
      url: url.toString(),
      mimeType,
      fileSize,
      folder: normalizeFolder(body?.folder),
      category: assetTypeOf(mimeType, null),
      source: "url",
      originalFilename: filename.slice(0, 255),
      tags: [],
    })
    .returning();
  return NextResponse.json(toAsset(row), { status: 201 });
}

function guessMime(pathname: string): string | null {
  const ext = pathname.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    svg: "image/svg+xml", avif: "image/avif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    pdf: "application/pdf", doc: "application/msword", zip: "application/zip", txt: "text/plain",
  };
  return ext ? map[ext] ?? null : null;
}
