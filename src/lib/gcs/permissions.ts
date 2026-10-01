import { assetVisibleCondition, authorizeAsset } from "@/lib/library";
import { and, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { getViewer } from "@/lib/access";
import { verifyShareToken } from "@/lib/share";
export async function authorizeAssetRead(
  request: Request,
  {
    urls,
    record,
  }: {
    key?: string;
    urls: string[];
    record?: { metadata: { tenantId?: string } } | null;
  },
) {
  const candidates = await db
    .select()
    .from(assets)
    .where(and(assetVisibleCondition(), or(inArray(assets.url, urls), inArray(assets.thumbnailUrl, urls))));
  const rows = candidates;
  if (!rows.length) return false;
  const token = new URL(request.url).searchParams.get("share");
  const payload = token ? verifyShareToken(token) : null;
  if (rows.some((row) => payload && (row.tenantId ? payload.t === row.tenantId : payload.t === "personal" && payload.u === row.ownerUserId) && (payload.k === "asset" ? payload.id === row.id : payload.f === row.folder))) return true;
  const viewer = await getViewer(request.headers).catch(() => null);
  if (!viewer) return false;
  for (const row of rows) {
    try { await authorizeAsset(viewer, row.id); return true; } catch {}
  }
  return false;
}
