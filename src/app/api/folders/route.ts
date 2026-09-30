import {
  renameFolderStatement,
  restoreFolderStatement,
} from "@/lib/folder-lifecycle";
import { libraryOwnership, assertFolderActive } from "@/lib/library";
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, assetFolders } from "@/lib/db/schema";
import { guard, jsonError } from "@/lib/api";
import { normalizeFolder } from "@/lib/assets";
import { libraryScope, folderScope, ensureFolder } from "@/lib/library";
import { queryOverview } from "@/lib/queries";
import { restoreDeadline } from "@/lib/asset-policy";
export async function GET(req: NextRequest) {
  const scopeFolder = req.nextUrl.searchParams.get("folder");
  const a = await guard(
    req.headers,
    req.nextUrl.searchParams.get("tenantId"),
    "read",
    scopeFolder,
  );
  if ("error" in a) return a.error;
  const sharedFolder = a.tenant.role === "shared" ? scopeFolder : undefined;
  const overview = await queryOverview(a.tenant.id, a.viewer.id, sharedFolder);
  const folders = await db
    .select()
    .from(assetFolders)
    .where(
      and(
        folderScope(a.tenant.id, a.viewer.id),
        ...(sharedFolder
          ? [
              sql`(${assetFolders.path}=${sharedFolder} or left(${assetFolders.path},${sharedFolder.length + 1})=${sharedFolder + "/"})`,
            ]
          : []),
      ),
    );
  return NextResponse.json({ ...overview, folderPolicies: folders });
}
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const a = await guard(req.headers, b?.tenantId, "write");
  if ("error" in a) return a.error;
  const path = normalizeFolder(b.path ?? b.folder ?? b.name);
  if (!path) return jsonError("Folder required", 400);
  let row = await ensureFolder(a.tenant.id, a.viewer.id, path);
  if (!row) return jsonError("Folder missing", 404);
  if ("expiresAt" in b) {
    if (!a.tenant.canDelete)
      return jsonError("Only library administrators can set expiration", 403);
    const expiresAt = b.expiresAt === null ? null : new Date(b.expiresAt);
    if (
      expiresAt &&
      (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())
    )
      return jsonError("Choose a future expiration", 400);
    [row] = await db
      .update(assetFolders)
      .set({ expiresAt })
      .where(eq(assetFolders.id, row.id))
      .returning();
  }
  return NextResponse.json(row, { status: 201 });
}
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const a = await guard(req.headers, b?.tenantId, "delete");
  if ("error" in a) return a.error;
  let path = normalizeFolder(b.folder ?? b.from);
  if (!path) return jsonError("Folder required", 400);
  const [row] = await db
    .select()
    .from(assetFolders)
    .where(
      and(folderScope(a.tenant.id, a.viewer.id), eq(assetFolders.path, path)),
    );
  if (!row) return jsonError("Folder missing", 404);
  const changes: Partial<typeof assetFolders.$inferInsert> = {};
  if ("expiresAt" in b) {
    changes.expiresAt = b.expiresAt === null ? null : new Date(b.expiresAt);
    if (
      changes.expiresAt &&
      (!Number.isFinite(changes.expiresAt.getTime()) ||
        changes.expiresAt <= new Date())
    )
      return jsonError("Choose a future expiration", 400);
  }
  const ownership = libraryOwnership(a.tenant.id, a.viewer.id);
  if (b.restore) {
    if (b.to) return jsonError("Restore before renaming", 400);
    let deadline;
    try {
      deadline = restoreDeadline(row.expiresAt, changes.expiresAt);
    } catch (e) {
      return jsonError(String(e), 409);
    }
    const restored = await db.execute(
      restoreFolderStatement(
        ownership.tenantId,
        ownership.ownerUserId,
        path,
        deadline,
      ),
    );
    if (!restored.rows.length)
      return jsonError(
        "Restore the parent folder and clear elapsed deadlines first",
        409,
      );
  } else {
    if (b.to) {
      const to = normalizeFolder(b.to);
      if (!to) return jsonError("Folder required", 400);
      if (to.startsWith(path + "/"))
        return jsonError("A folder cannot move inside itself", 400);
      try {
        await assertFolderActive(a.tenant.id, a.viewer.id, to);
        const renamed = await db.execute(
          renameFolderStatement(
            ownership.tenantId,
            ownership.ownerUserId,
            path,
            to,
          ),
        );
        if (!renamed.rows.length)
          return jsonError("A folder already exists at the destination", 409);
      } catch {
        return jsonError("Destination is unavailable or already exists", 409);
      }
      path = to;
    }
    if (Object.keys(changes).length)
      await db
        .update(assetFolders)
        .set(changes)
        .where(eq(assetFolders.id, row.id));
    else if (!b.to) return jsonError("No changes supplied", 400);
  }
  const [updated] = await db
    .select()
    .from(assetFolders)
    .where(eq(assetFolders.id, row.id));
  return NextResponse.json(updated);
}
export async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const a = await guard(req.headers, b?.tenantId, "delete");
  if ("error" in a) return a.error;
  const path = normalizeFolder(b.name ?? b.folder);
  if (!path) return jsonError("Folder required", 400);
  await ensureFolder(a.tenant.id, a.viewer.id, path);
  const deletedAt = new Date();
  await db
    .update(assetFolders)
    .set({
      trashedAt: deletedAt,
      trashReason: sql`case when ${assetFolders.path}=${path} then 'deleted' else 'folder-deleted' end`,
    })
    .where(
      and(
        folderScope(a.tenant.id, a.viewer.id),
        sql`${assetFolders.trashedAt} is null`,
        sql`(${assetFolders.path}=${path} or left(${assetFolders.path},${path.length + 1})=${path + "/"})`,
      ),
    );
  const rows = await db
    .update(assets)
    .set({
      trashedAt: deletedAt,
      trashReason: "folder-deleted",
      updatedAt: new Date(),
    })
    .where(
      and(
        libraryScope(a.tenant.id, a.viewer.id),
        sql`${assets.trashedAt} is null`,
        sql`(${assets.folder}=${path} or left(${assets.folder},${path.length + 1})=${path + "/"})`,
      ),
    )
    .returning({ id: assets.id });
  return NextResponse.json({ count: rows.length });
}
