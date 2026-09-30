import {
  assertFolderActive,
  ensureFolder,
} from "@/lib/library";
import { restoreDeadline } from "@/lib/asset-policy";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { guard, jsonError, removeOrphanedUploads } from "@/lib/api";
import { normalizeFolder, normalizeTags, toAsset } from "@/lib/assets";

async function load(req: NextRequest, id: string, need: "write" | "delete") {
  const [row] = await db
    .select()
    .from(assets)
    .where(eq(assets.id, id))
    .catch(() => []);
  if (!row) return { error: jsonError("Not found", 404) };
  const access = await guard(req.headers, row.tenantId ?? "personal", need);
  if ("error" in access) return { error: access.error };
  if (!row.tenantId && row.ownerUserId !== access.viewer.id)
    return { error: jsonError("Forbidden", 403) };
  return { row, ...access };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const result = await load(req, params.id, "write");
  if ("error" in result) return result.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Invalid body", 400);

  const libraryId = result.row.tenantId ?? "personal";
  const destination =
    "folder" in body ? normalizeFolder(body.folder) : result.row.folder;
  if (!body.restore) {
    try {
      await assertFolderActive(libraryId, result.viewer.id, destination);
    } catch {
      return jsonError("Folder unavailable", 409);
    }
  }
  await ensureFolder(libraryId, result.viewer.id, destination);
  const updates: Partial<typeof assets.$inferInsert> = {};
  if ("name" in body) {
    const name =
      typeof body.name === "string" ? body.name.trim().slice(0, 255) : "";
    if (!name) return jsonError("Name is required", 400);
    updates.name = name;
  }
  if ("folder" in body) updates.folder = normalizeFolder(body.folder);
  if ("tags" in body) updates.tags = normalizeTags(body.tags);
  if ("description" in body) {
    updates.description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 2000) || null
        : null;
  }
  if ("altText" in body) {
    updates.altText =
      typeof body.altText === "string"
        ? body.altText.trim().slice(0, 500) || null
        : null;
  }

  if (("expiresAt" in body || body.restore) && !result.tenant.canDelete)
    return jsonError("Only library administrators can change lifecycle", 403);
  if ("expiresAt" in body) {
    const value = body.expiresAt === null ? null : new Date(body.expiresAt);
    if (value && (!Number.isFinite(value.getTime()) || value <= new Date()))
      return jsonError("Choose a future expiration", 400);
    updates.expiresAt = value;
  }
  if (body.restore) {
    try {
      updates.expiresAt = restoreDeadline(
        result.row.expiresAt,
        updates.expiresAt,
      );
      await assertFolderActive(libraryId, result.viewer.id, destination);
    } catch (e) {
      return jsonError(String(e), 409);
    }
    updates.trashedAt = null;
    updates.trashReason = null;
  }
  const [row] = await db
    .update(assets)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(assets.id, params.id))
    .returning();
  return NextResponse.json(toAsset(row));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const result = await load(req, params.id, "delete");
  if ("error" in result) return result.error;

  if (req.nextUrl.searchParams.get("permanent") !== "1") {
    await db
      .update(assets)
      .set({
        trashedAt: new Date(),
        trashReason: "deleted",
        updatedAt: new Date(),
      })
      .where(eq(assets.id, params.id));
    return NextResponse.json({ ok: true });
  }
  if (!result.row.trashedAt)
    return jsonError("Move the file to Trash first", 409);
  const deleted = await db
    .delete(assets)
    .where(eq(assets.id, params.id))
    .returning({ url: assets.url, source: assets.source });
  await removeOrphanedUploads(deleted);
  return NextResponse.json({ ok: true });
}
