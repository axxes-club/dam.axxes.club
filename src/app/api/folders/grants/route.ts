import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { folderGrants, assetFolders } from "@/lib/db/schema";
import { guard, jsonError } from "@/lib/api";
import { folderScope, ensureFolder } from "@/lib/library";
import { normalizeFolder } from "@/lib/assets";
export async function GET(req: NextRequest) {
  const a = await guard(
    req.headers,
    req.nextUrl.searchParams.get("tenantId"),
    "delete",
  );
  if ("error" in a) return a.error;
  const rows = await db
    .select({ grant: folderGrants, folder: assetFolders.path })
    .from(folderGrants)
    .innerJoin(assetFolders, eq(folderGrants.folderId, assetFolders.id))
    .where(folderScope(a.tenant.id, a.viewer.id));
  return NextResponse.json({ grants: rows });
}
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const a = await guard(req.headers, b?.tenantId, "delete");
  if ("error" in a) return a.error;
  const path = normalizeFolder(b.folder);
  if (!path || Boolean(b.recipientUserId) === Boolean(b.recipientTenantId))
    return jsonError("Choose one recipient and folder", 400);
  const folder = await ensureFolder(a.tenant.id, a.viewer.id, path);
  if (!folder) return jsonError("Folder missing", 404);
  const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
  if (
    expiresAt &&
    (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())
  )
    return jsonError("Choose a future expiration", 400);
  const [grant] = await db
    .insert(folderGrants)
    .values({
      folderId: folder.id,
      recipientUserId: b.recipientUserId ?? null,
      recipientTenantId: b.recipientTenantId ?? null,
      canRead: b.canRead !== false,
      canUpload: b.canUpload === true,
      expiresAt,
    })
    .returning();
  return NextResponse.json(grant, { status: 201 });
}
export async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const a = await guard(req.headers, b?.tenantId, "delete");
  if ("error" in a) return a.error;
  const [row] = await db
    .select({ id: folderGrants.id })
    .from(folderGrants)
    .innerJoin(assetFolders, eq(folderGrants.folderId, assetFolders.id))
    .where(
      and(
        eq(folderGrants.id, b.grantId),
        folderScope(a.tenant.id, a.viewer.id),
      ),
    );
  if (!row) return jsonError("Not found", 404);
  await db.delete(folderGrants).where(eq(folderGrants.id, row.id));
  return NextResponse.json({ ok: true });
}
