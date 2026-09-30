import { libraryScope, assetVisibleCondition, assertFolderActive, ensureFolder } from "@/lib/library";
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { cleanIds, guard, jsonError } from "@/lib/api";
import { normalizeFolder, normalizeTags } from "@/lib/assets";

// { tenantId, action: "move" | "tag" | "delete", ids, folder?, tags? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (!["move", "tag", "delete"].includes(action)) return jsonError("Unknown action", 400);

  const access = await guard(req.headers, body?.tenantId, action === "delete" ? "delete" : "write");
  if ("error" in access) return access.error;

  const ids = cleanIds(body?.ids);
  if (!ids.length) return NextResponse.json({ count: 0 });
  const scope = and(libraryScope(access.tenant.id,access.viewer.id), inArray(assets.id, ids),assetVisibleCondition());

  if (action === "move") {
    await assertFolderActive(access.tenant.id,access.viewer.id,normalizeFolder(body.folder));
    await ensureFolder(access.tenant.id,access.viewer.id,normalizeFolder(body.folder));
    const moved = await db
      .update(assets)
      .set({ folder: normalizeFolder(body.folder), updatedAt: new Date() })
      .where(scope)
      .returning({ id: assets.id });
    return NextResponse.json({ count: moved.length });
  }

  if (action === "tag") {
    const newTags = normalizeTags(body.tags);
    if (!newTags.length) return jsonError("Add at least one tag", 400);
    const rows = await db.select({ id: assets.id, tags: assets.tags }).from(assets).where(scope);
    await Promise.all(
      rows.map((row) =>
        db
          .update(assets)
          .set({ tags: normalizeTags([...(row.tags ?? []), ...newTags]), updatedAt: new Date() })
          .where(eq(assets.id, row.id))
      )
    );
    return NextResponse.json({ count: rows.length });
  }

  const deleted = await db.update(assets).set({trashedAt:new Date(),trashReason:"deleted",updatedAt:new Date()}).where(scope).returning({id:assets.id});
  return NextResponse.json({ count: deleted.length });
}
