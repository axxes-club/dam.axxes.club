import { inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { getViewer } from "@/lib/access";
import { verifyShareToken } from "@/lib/share";
import { matchesShare, tenantCanRead } from "./permissions-core.mjs";
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
    .where(or(inArray(assets.url, urls), inArray(assets.thumbnailUrl, urls)));
  const rows = candidates.filter(
    (row) =>
      !record?.metadata.tenantId || row.tenantId === record.metadata.tenantId,
  );
  if (!rows.length) return false;
  const token = new URL(request.url).searchParams.get("share");
  const payload = token ? verifyShareToken(token) : null;
  if (rows.some((row) => matchesShare(payload, row))) return true;
  const viewer = await getViewer(request.headers).catch(() => null);
  return rows.some((row) => tenantCanRead(viewer, row.tenantId));
}
