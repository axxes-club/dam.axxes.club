import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { UTApi } from "uploadthing/server";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { getViewer, tenantAccess } from "@/lib/access";
import { normalizeFolder, normalizeTags, toAsset, uploadthingKey } from "@/lib/assets";

async function loadForViewer(req: NextRequest, id: string) {
  const viewer = await getViewer(req.headers);
  if (!viewer) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const [row] = await db.select().from(assets).where(eq(assets.id, id)).catch(() => []);
  const tenant = row ? tenantAccess(viewer, row.tenantId) : null;
  if (!row || !tenant) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  return { row, tenant };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const result = await loadForViewer(req, params.id);
  if ("error" in result) return result.error;
  if (!result.tenant.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Partial<typeof assets.$inferInsert> = {};
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 255) : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
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
  const result = await loadForViewer(req, params.id);
  if ("error" in result) return result.error;
  if (!result.tenant.canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(assets).where(eq(assets.id, params.id));

  // Files we uploaded ourselves also get removed from storage; external URLs are left alone.
  if (result.row.source === "upload") {
    const key = uploadthingKey(result.row.url);
    if (key) {
      await new UTApi().deleteFiles(key).catch((err) => {
        console.error("Failed to delete UploadThing file", key, err);
      });
    }
  }

  return NextResponse.json({ ok: true });
}
