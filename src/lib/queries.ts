import { and, count, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import { assetAppLinks, assets } from "./db/schema";
import { ASSET_TYPES, PAGE_SIZE, assetOrderBy, assetTypeCondition, toAsset } from "./assets";
import { UNFILED, type AssetAppLink, type AssetPage, type AssetQuery, type Overview } from "./types";

export async function queryAssets(tenantId: string, query: AssetQuery): Promise<AssetPage> {
  const conditions: SQL[] = [eq(assets.tenantId, tenantId)];

  const q = query.q?.trim();
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
  if (query.type && ASSET_TYPES.includes(query.type)) conditions.push(assetTypeCondition(query.type));
  if (query.folder === UNFILED) conditions.push(isNull(assets.folder));
  else if (query.folder) conditions.push(eq(assets.folder, query.folder));

  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        row: assets,
        // A file can be attached to several apps at once, so the links come back
        // as a json array rather than a second row per app. Scoped to the
        // workspace: a link row is not permission to read another tenant's file.
        appLinks: sql<{ appKey: string; recordId: string }[] | null>`(select coalesce(json_agg(json_build_object(
              'appKey', ${assetAppLinks.appKey},
              'recordId', ${assetAppLinks.recordId}::text
            )), '[]'::json)
            from ${assetAppLinks}
            where ${assetAppLinks.assetId} = ${assets.id}
              and ${assetAppLinks.tenantId} = ${tenantId})`,
      })
      .from(assets)
      .where(where)
      .orderBy(...assetOrderBy(query.sort))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: count() }).from(assets).where(where),
  ]);

  return {
    assets: rows.map((r) => toAsset(r.row, (r.appLinks ?? []) as AssetAppLink[])),
    total,
    nextOffset: offset + rows.length < total ? offset + rows.length : null,
  };
}

export async function queryOverview(tenantId: string): Promise<Overview> {
  const isImage = assetTypeCondition("image");

  const [folders, [counts], previews] = await Promise.all([
    db
      .select({ name: assets.folder, count: count() })
      .from(assets)
      .where(and(eq(assets.tenantId, tenantId), isNotNull(assets.folder)))
      .groupBy(assets.folder)
      .orderBy(sql`lower(${assets.folder})`),
    db
      .select({
        all: count(),
        image: sql<number>`count(*) filter (where ${isImage})`.mapWith(Number),
        video: sql<number>`count(*) filter (where ${assetTypeCondition("video")})`.mapWith(Number),
        document: sql<number>`count(*) filter (where ${assetTypeCondition("document")})`.mapWith(Number),
        unfiled: sql<number>`count(*) filter (where ${assets.folder} is null)`.mapWith(Number),
        storageBytes: sql<number>`coalesce(sum(${assets.fileSize}), 0)`.mapWith(Number),
      })
      .from(assets)
      .where(eq(assets.tenantId, tenantId)),
    // Three most recent images per folder for the folder tiles
    db.execute<{ folder: string; url: string }>(sql`
      select folder, url from (
        select ${assets.folder} as folder, coalesce(${assets.thumbnailUrl}, ${assets.url}) as url,
               row_number() over (partition by ${assets.folder} order by ${assets.createdAt} desc) as rn
        from ${assets}
        where ${assets.tenantId} = ${tenantId} and ${assets.folder} is not null and ${isImage}
      ) ranked
      where rn <= 3
    `),
  ]);

  const previewMap = new Map<string, string[]>();
  for (const row of previews.rows) {
    const list = previewMap.get(row.folder) ?? [];
    list.push(row.url);
    previewMap.set(row.folder, list);
  }

  const { storageBytes, ...rest } = counts;
  return {
    folders: folders.map((f) => ({ name: f.name!, count: f.count, previews: previewMap.get(f.name!) ?? [] })),
    counts: rest,
    storageBytes,
  };
}
