import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, assetAppLinks, assetOwnershipEvents } from "@/lib/db/schema";
import { guard, jsonError } from "@/lib/api";
import {
  authorizeAsset,
  assertFolderActive,
  ensureFolder,
  libraryOwnership,
} from "@/lib/library";
import { normalizeFolder, toAsset } from "@/lib/assets";
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const b = await req.json().catch(() => null);
  const destination = await guard(req.headers, b?.tenantId, "delete");
  if ("error" in destination) return destination.error;
  let original;
  try {
    original = await authorizeAsset(destination.viewer, params.id, "delete");
  } catch {
    return jsonError("Forbidden", 403);
  }
  const [link]=await db.select({id:assetAppLinks.id}).from(assetAppLinks).where(eq(assetAppLinks.assetId,original.id)).limit(1);
  if(original.source==='office'||link)return jsonError('Linked files must stay in their workspace. Duplicate the document in Office instead.',409);
  if (original.trashedAt)
    return jsonError("Restore the file before transferring ownership", 409);
  const folder = normalizeFolder(b.folder);
  try {
    await assertFolderActive(
      destination.tenant.id,
      destination.viewer.id,
      folder,
    );
  } catch {
    return jsonError("Folder unavailable", 409);
  }
  await ensureFolder(destination.tenant.id, destination.viewer.id, folder);
  const ownership = libraryOwnership(
    destination.tenant.id,
    destination.viewer.id,
  );
  const changed = await db.execute<{ id: string }>(sql`
    with moved as (
      update ${assets} set tenant_id=${ownership.tenantId},owner_user_id=${ownership.ownerUserId},folder=${folder},updated_at=now()
      where id=${original.id} and tenant_id is not distinct from ${original.tenantId}::uuid
      and owner_user_id is not distinct from ${original.ownerUserId} and trashed_at is null
      returning id
    ), audited as (
      insert into ${assetOwnershipEvents}(asset_id,actor_user_id,from_tenant_id,from_owner_user_id,to_tenant_id,to_owner_user_id)
      select id,${destination.viewer.id},${original.tenantId}::uuid,${original.ownerUserId},${ownership.tenantId}::uuid,${ownership.ownerUserId} from moved returning asset_id
    ) select asset_id as id from audited
  `);
  if (!changed.rows.length)
    return jsonError("Ownership changed; refresh and retry", 409);
  const [row] = await db
    .select()
    .from(assets)
    .where(eq(assets.id, original.id));
  return NextResponse.json(toAsset(row));
}
