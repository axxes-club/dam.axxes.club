import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { guard, jsonError, removeOrphanedUploads } from "@/lib/api";
import { normalizeFolder } from "@/lib/assets";
import { queryOverview } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const access = await guard(req.headers, req.nextUrl.searchParams.get("tenantId"));
  if ("error" in access) return access.error;
  return NextResponse.json(await queryOverview(access.tenant.id));
}

// Rename: { tenantId, from, to }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const access = await guard(req.headers, body?.tenantId, "write");
  if ("error" in access) return access.error;

  const to = normalizeFolder(body?.to);
  if (!to || typeof body?.from !== "string") return jsonError("Folder name is required", 400);
  const moved = await db
    .update(assets)
    .set({ folder: to, updatedAt: new Date() })
    .where(and(eq(assets.tenantId, access.tenant.id), eq(assets.folder, body.from)))
    .returning({ id: assets.id });
  return NextResponse.json({ count: moved.length });
}

// Delete: { tenantId, name, deleteContents } — contents move to Unfiled unless deleteContents
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const deleteContents = body?.deleteContents === true;
  const access = await guard(req.headers, body?.tenantId, deleteContents ? "delete" : "write");
  if ("error" in access) return access.error;
  if (typeof body?.name !== "string") return jsonError("Folder name is required", 400);

  const scope = and(eq(assets.tenantId, access.tenant.id), eq(assets.folder, body.name));
  if (deleteContents) {
    const deleted = await db.delete(assets).where(scope).returning({ url: assets.url, source: assets.source });
    await removeOrphanedUploads(deleted);
    return NextResponse.json({ count: deleted.length });
  }
  const moved = await db.update(assets).set({ folder: null, updatedAt: new Date() }).where(scope).returning({ id: assets.id });
  return NextResponse.json({ count: moved.length });
}
