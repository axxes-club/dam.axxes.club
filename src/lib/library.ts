import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import { assets, assetFolders, folderGrants } from "./db/schema";
import { tenantAccess } from "./library-access";
import type { Viewer } from "./types";
export function libraryOwnership(libraryId: string, userId: string) {
  return libraryId === "personal" || libraryId.startsWith("user:")
    ? {
        tenantId: null,
        ownerUserId: libraryId.startsWith("user:")
          ? libraryId.slice(5)
          : userId,
      }
    : { tenantId: libraryId, ownerUserId: null };
}
export function libraryScope(libraryId: string, userId: string): SQL {
  return libraryId === "personal" || libraryId.startsWith("user:")
    ? and(
        isNull(assets.tenantId),
        eq(
          assets.ownerUserId,
          libraryId.startsWith("user:") ? libraryId.slice(5) : userId,
        ),
      )!
    : eq(assets.tenantId, libraryId);
}
export function folderScope(libraryId: string, userId: string): SQL {
  return libraryId === "personal" || libraryId.startsWith("user:")
    ? and(
        isNull(assetFolders.tenantId),
        eq(
          assetFolders.ownerUserId,
          libraryId.startsWith("user:") ? libraryId.slice(5) : userId,
        ),
      )!
    : eq(assetFolders.tenantId, libraryId);
}
export function assetVisibleCondition(now = new Date()): SQL {
  return sql`${assets.trashedAt} is null and (${assets.expiresAt} is null or ${assets.expiresAt}>${now}) and not exists(select 1 from ${assetFolders} f where ((f.tenant_id=${assets.tenantId}) or (f.tenant_id is null and f.owner_user_id=${assets.ownerUserId})) and (${assets.folder}=f.path or left(${assets.folder},length(f.path)+1)=f.path||'/') and (f.trashed_at is not null or f.expires_at<=${now}))`;
}
export async function ensureFolder(
  libraryId: string,
  userId: string,
  path: string | null,
) {
  if (!path) return null;
  const [existing] = await db
    .select()
    .from(assetFolders)
    .where(and(folderScope(libraryId, userId), eq(assetFolders.path, path)));
  if (existing) return existing;
  const [row] = await db
    .insert(assetFolders)
    .values({
      ...libraryOwnership(libraryId, userId),
      libraryId: libraryId === "personal" ? `user:${userId}` : libraryId,
      path,
    })
    .onConflictDoNothing()
    .returning();
  return (
    row ??
    (
      await db
        .select()
        .from(assetFolders)
        .where(and(folderScope(libraryId, userId), eq(assetFolders.path, path)))
    )[0]
  );
}
export async function assertFolderActive(
  libraryId: string,
  userId: string,
  path: string | null,
  database: typeof db = db,
) {
  if (!path) return;
  const rows = await database
    .select()
    .from(assetFolders)
    .where(folderScope(libraryId, userId));
  if (
    rows.some(
      (f) =>
        (path === f.path || path.startsWith(f.path + "/")) &&
        (f.trashedAt || (f.expiresAt && f.expiresAt <= new Date())),
    )
  )
    throw new Error("Folder unavailable");
}
export async function assertLibraryAccess(
  viewer: Viewer,
  libraryId: string,
  need: "read" | "write" | "delete" = "read",
  folder?: string | null,
  database: typeof db = db,
) {
  const access = tenantAccess(viewer, libraryId);
  if (
    access &&
    (need === "read" || (need === "write" ? access.canWrite : access.canDelete))
  ) {
    await assertFolderActive(libraryId, viewer.id, folder ?? null, database);
    return access;
  }
  if (folder && need !== "delete") {
    const rows = await database
      .select({ folder: assetFolders, grant: folderGrants })
      .from(folderGrants)
      .innerJoin(assetFolders, eq(folderGrants.folderId, assetFolders.id));
    const row = rows.find(
      (r) =>
        r.folder.libraryId === libraryId &&
        (r.folder.path === folder || folder.startsWith(r.folder.path + "/")) &&
        (r.grant.recipientUserId === viewer.id ||
          viewer.tenants.some((t) => t.id === r.grant.recipientTenantId)) &&
        (!r.grant.expiresAt || r.grant.expiresAt > new Date()) &&
        !r.folder.trashedAt &&
        (!r.folder.expiresAt || r.folder.expiresAt > new Date()) &&
        (need === "read" ? r.grant.canRead : r.grant.canUpload),
    );
    if (row) {
      await assertFolderActive(libraryId, viewer.id, folder, database);
      return {
        id: libraryId,
        name: "Shared folder",
        role: "shared",
        canWrite: row.grant.canUpload,
        canDelete: false,
      };
    }
  }
  throw new Error("Forbidden");
}
export async function authorizeAsset(
  viewer: Viewer,
  id: string,
  need: "read" | "write" | "delete" = "read",
  database: typeof db = db,
) {
  const [row] = await database
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.id, id),
        ...(need === "read" ? [assetVisibleCondition()] : []),
      ),
    );
  if (!row) throw new Error("Forbidden");
  const libraryId =
    row.tenantId ??
    (row.ownerUserId === viewer.id ? "personal" : `user:${row.ownerUserId}`);
  if (need !== "read" && !tenantAccess(viewer, libraryId))
    throw new Error("Only owners may manage assets");
  await assertLibraryAccess(
    viewer,
    libraryId,
    need,
    need === "read" ? row.folder : null,
    database,
  );
  return row;
}
export async function sharedFolderDestinations(viewer: Viewer) {
  const rows = await db
    .select({ folder: assetFolders, grant: folderGrants })
    .from(folderGrants)
    .innerJoin(assetFolders, eq(folderGrants.folderId, assetFolders.id));
  const allowed = rows.filter(
    (r) =>
      (r.grant.recipientUserId === viewer.id ||
        viewer.tenants.some((t) => t.id === r.grant.recipientTenantId)) &&
      (!r.grant.expiresAt || r.grant.expiresAt > new Date()) &&
      !r.folder.trashedAt &&
      (!r.folder.expiresAt || r.folder.expiresAt > new Date()),
  );
  const results = [];
  for (const r of allowed) {
    try {
      await assertFolderActive(r.folder.libraryId, viewer.id, r.folder.path);
      results.push({
        libraryId: r.folder.libraryId,
        folder: r.folder.path,
        ownerUserId: r.folder.ownerUserId,
        tenantId: r.folder.tenantId,
        canRead: r.grant.canRead,
        canWrite: r.grant.canUpload,
        expiresAt: r.folder.expiresAt,
      });
    } catch {}
  }
  return results;
}
