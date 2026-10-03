import { assertFolderActive } from "@/lib/library";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { guard, jsonError } from "@/lib/api";
import { toAsset } from "@/lib/assets";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const [original] = await db.select().from(assets).where(eq(assets.id, params.id)).catch(() => []);
  if (!original) return jsonError("Not found", 404);
  const access = await guard(req.headers, original.tenantId ?? "personal", "write");
  if ("error" in access) return access.error;

  if(!original.tenantId&&original.ownerUserId!==access.viewer.id)return jsonError("Forbidden",403);
  if(original.trashedAt||(original.expiresAt&&original.expiresAt<=new Date()))return jsonError("File unavailable",409);
  await assertFolderActive(access.tenant.id,access.viewer.id,original.folder);
  if(original.source==='office')return jsonError('Duplicate this document in Office to copy its content.',409);
  const copy: typeof assets.$inferInsert = { ...original, name: `${original.name} (copy)`.slice(0, 255) };
  delete copy.id;
  copy.uploadKey=null;
  delete copy.createdAt;
  delete copy.updatedAt;
  const [row] = await db
    .insert(assets)
    .values(copy)
    .returning();
  return NextResponse.json(toAsset(row), { status: 201 });
}
