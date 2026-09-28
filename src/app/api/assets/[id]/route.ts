import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { guard, jsonError, removeOrphanedUploads } from "@/lib/api";
import { normalizeFolder, normalizeTags, toAsset } from "@/lib/assets";

async function load(req: NextRequest, id: string, need: "write" | "delete") {
  const [row] = await db.select().from(assets).where(eq(assets.id, id)).catch(() => []);
  if (!row) return { error: jsonError("Not found", 404) };
  const access = await guard(req.headers, row.tenantId, need);
  if ("error" in access) return { error: access.error };
  return { row, ...access };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const result = await load(req, params.id, "write");
  if ("error" in result) return result.error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Invalid body", 400);

  const updates: Partial<typeof assets.$inferInsert> = {};
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 255) : "";
    if (!name) return jsonError("Name is required", 400);
    updates.name = name;
  }
  if ("folder" in body) updates.folder = normalizeFolder(body.folder);
  if ("tags" in body) updates.tags = normalizeTags(body.tags);
  if ("description" in body) {
    updates.description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) || null : null;
  }
  if ("altText" in body) {
    updates.altText = typeof body.altText === "string" ? body.altText.trim().slice(0, 500) || null : null;
  }

  const [row] = await db
    .update(assets)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(assets.id, params.id))
    .returning();
  return NextResponse.json(toAsset(row));
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const result = await load(req, params.id, "delete");
  if ("error" in result) return result.error;

  const deleted = await db.delete(assets).where(eq(assets.id, params.id)).returning({ url: assets.url, source: assets.source });
  await removeOrphanedUploads(deleted);
  return NextResponse.json({ ok: true });
}
