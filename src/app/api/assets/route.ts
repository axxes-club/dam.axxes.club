import { libraryOwnership, ensureFolder, assertFolderActive } from "@/lib/library";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { guard, jsonError } from "@/lib/api";
import { assetTypeOf, normalizeFolder, toAsset } from "@/lib/assets";
import { queryAssets } from "@/lib/queries";
import type { AssetSort, AssetType } from "@/lib/types";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const access = await guard(req.headers, params.get("tenantId"), "read", params.get("folder"));
  if ("error" in access) return access.error;

  const page = await queryAssets(access.tenant.id, {
    q: params.get("q") ?? undefined,
    type: params.get("type") as AssetType | null,
    folder: params.get("folder"),
    sort: (params.get("sort") as AssetSort | null) ?? undefined,
    offset: Number(params.get("offset")) || 0,
    trash: access.tenant.role !== "shared" && params.get("trash") === "1",
    scopeFolder: access.tenant.role === "shared" ? params.get("folder") : undefined,
  }, access.viewer.id);
  return NextResponse.json(page);
}

// Add a file by URL; the file stays where it is hosted
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const access = await guard(req.headers, body?.tenantId, "write", normalizeFolder(body?.folder));
  if ("error" in access) return access.error;

  let url: URL;
  try {
    url = new URL(String(body?.url ?? "").trim());
  } catch {
    return jsonError("Enter a valid URL", 400);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return jsonError("Only http(s) links are supported", 400);

  // Linked files stay on their original host; do not perform server-side probes
  // of a user-supplied address (including redirects to private networks).
  const mimeType = guessMime(url.pathname);
  const fileSize = null;

  const filename = decodeURIComponent(url.pathname.split("/").pop() || "") || url.hostname;
  const name = (String(body?.name ?? "").trim() || filename.replace(/\.[^.]+$/, "") || filename).slice(0, 255);

  await assertFolderActive(access.tenant.id,access.viewer.id,normalizeFolder(body?.folder));
  await ensureFolder(access.tenant.id,access.viewer.id,normalizeFolder(body?.folder));
  const [row] = await db
    .insert(assets)
    .values({
      ...libraryOwnership(access.tenant.id, access.viewer.id),
      uploadedById: access.viewer.id,
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
