import { NextResponse, type NextRequest } from "next/server";
import { and, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { getViewer, tenantAccess } from "@/lib/access";
import { ASSET_TYPES, UNFILED, assetTypeCondition, toAsset } from "@/lib/assets";
import type { AssetPage, AssetType } from "@/lib/types";

const PAGE_SIZE = 60;

export async function GET(req: NextRequest) {
  const viewer = await getViewer(req.headers);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const tenant = tenantAccess(viewer, params.get("tenantId"));
  if (!tenant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const conditions: SQL[] = [eq(assets.tenantId, tenant.id)];

  const q = params.get("q")?.trim();
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      or(
        ilike(assets.name, pattern),
        ilike(assets.originalFilename, pattern),
        ilike(assets.description, pattern),
        sql`${assets.tags}::text ilike ${pattern}`
      )!
    );
  }

  const type = params.get("type") as AssetType | null;
  if (type && ASSET_TYPES.includes(type)) conditions.push(assetTypeCondition(type));

  const folder = params.get("folder");
  if (folder === UNFILED) conditions.push(isNull(assets.folder));
  else if (folder) conditions.push(eq(assets.folder, folder));

  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(assets)
      .where(where)
      .orderBy(desc(assets.createdAt), desc(assets.id))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: count() }).from(assets).where(where),
  ]);

  const body: AssetPage = {
    assets: rows.map(toAsset),
    total,
    nextOffset: offset + rows.length < total ? offset + rows.length : null,
  };
  return NextResponse.json(body);
}
