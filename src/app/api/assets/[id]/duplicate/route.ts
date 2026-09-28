import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { guard, jsonError } from "@/lib/api";
import { toAsset } from "@/lib/assets";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const [original] = await db.select().from(assets).where(eq(assets.id, params.id)).catch(() => []);
  if (!original) return jsonError("Not found", 404);
  const access = await guard(req.headers, original.tenantId, "write");
  if ("error" in access) return access.error;

  const copy: typeof assets.$inferInsert = { ...original, name: `${original.name} (copy)`.slice(0, 255) };
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  const [row] = await db
    .insert(assets)
    .values(copy)
    .returning();
  return NextResponse.json(toAsset(row), { status: 201 });
}
