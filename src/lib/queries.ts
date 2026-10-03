import {folderFilter} from "./folders-search";
import { libraryScope, assetVisibleCondition, folderScope } from "./library";
import {
  and,
  count,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "./db";
import {
  assetAppLinks,
  assetAppGrants,
  assets,
  assetFolders,
} from "./db/schema";
import {
  ASSET_TYPES,
  PAGE_SIZE,
  assetOrderBy,
  assetTypeCondition,
  toAsset,
} from "./assets";
import {
  type AssetAppLink,
  type AssetPage,
  type AssetQuery,
  type Overview,
} from "./types";

export async function queryAssets(
  tenantId: string,
  query: AssetQuery & { trash?: boolean; scopeFolder?: string | null; recursive?:boolean },
  userId = "",
): Promise<AssetPage> {
  const conditions: SQL[] = [
    libraryScope(tenantId, userId),
    query.trash ? sql`not (${assetVisibleCondition()})` : assetVisibleCondition(),
    ...(query.scopeFolder ? [sql`(${assets.folder}=${query.scopeFolder} or left(${assets.folder},${query.scopeFolder.length + 1})=${query.scopeFolder + "/"})`] : []),
  ];

  const q = query.q?.trim();
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      or(
        ilike(assets.name, pattern),
        ilike(assets.originalFilename, pattern),
        ilike(assets.description, pattern),
        sql`${assets.tags}::text ilike ${pattern}`,
      )!,
    );
  }
  if (query.type && ASSET_TYPES.includes(query.type))
    conditions.push(assetTypeCondition(query.type));
  const folderCondition=folderFilter(assets.folder,query.folder,query.recursive);
  if(folderCondition)conditions.push(folderCondition);

  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        row: assets,
        effectiveExpiresAt: sql<
          string | null
        >`least(${assets.expiresAt}, (select min(f.expires_at) from ${assetFolders} f where ((f.tenant_id=${assets.tenantId}) or (f.tenant_id is null and f.owner_user_id=${assets.ownerUserId})) and (${assets.folder}=f.path or left(${assets.folder},length(f.path)+1)=f.path||'/')))`,
        // A file can be attached to several apps at once, so the links come back
        // as a json array rather than a second row per app. Scoped to the
        // workspace: a link row is not permission to read another tenant's file.
        appLinks: sql<
          { appKey: string; recordId: string }[] | null
        >`(select coalesce(json_agg(json_build_object('appKey',usage.app_key,'recordId',usage.record_id::text)), '[]'::json) from (select app_key,record_id from ${assetAppLinks} where asset_id=${assets.id} union select app_key,record_id from ${assetAppGrants} where asset_id=${assets.id}) usage)`,
      })
      .from(assets)
      .where(where)
      .orderBy(...assetOrderBy(query.sort))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: count() }).from(assets).where(where),
  ]);

  return {
    assets: rows.map((r) => ({
      ...toAsset(r.row, (r.appLinks ?? []) as AssetAppLink[]),
      effectiveExpiresAt: r.effectiveExpiresAt
        ? new Date(r.effectiveExpiresAt).toISOString()
        : null,
    })),
    total,
    nextOffset: offset + rows.length < total ? offset + rows.length : null,
  };
}

export async function queryOverview(
  tenantId: string,
  userId = "",
  scopeFolder?: string | null,
): Promise<Overview> {
  const isImage = assetTypeCondition("image");
  const scope = and(libraryScope(tenantId, userId), ...(scopeFolder ? [sql`(${assets.folder}=${scopeFolder} or left(${assets.folder},${scopeFolder.length + 1})=${scopeFolder + "/"})`] : []))!;

  const [folders, [counts], previews] = await Promise.all([
    db
      .select({ name: assets.folder, count: count() })
      .from(assets)
      .where(
        and(
          and(scope, assetVisibleCondition())!,
          isNotNull(assets.folder),
        ),
      )
      .groupBy(assets.folder)
      .orderBy(sql`lower(${assets.folder})`),
    db
      .select({
        all: count(),
        image: sql<number>`count(*) filter (where ${isImage})`.mapWith(Number),
        video:
          sql<number>`count(*) filter (where ${assetTypeCondition("video")})`.mapWith(
            Number,
          ),
        document:
          sql<number>`count(*) filter (where ${assetTypeCondition("document")})`.mapWith(
            Number,
          ),
        unfiled:
          sql<number>`count(*) filter (where ${assets.folder} is null)`.mapWith(
            Number,
          ),
        storageBytes: sql<number>`coalesce(sum(${assets.fileSize}), 0)`.mapWith(
          Number,
        ),
      })
      .from(assets)
      .where(and(scope, assetVisibleCondition())!),
    // Three most recent images per folder for the folder tiles
    db.execute<{ folder: string; id: string }>(sql`
      select folder, id from (
        select ${assets.folder} as folder, ${assets.id} as id,
               row_number() over (partition by ${assets.folder} order by ${assets.createdAt} desc) as rn
        from ${assets}
        where ${scope} and ${assetVisibleCondition()} and ${assets.folder} is not null and ${isImage}
      ) ranked
      where rn <= 3
    `),
  ]);

  const previewMap = new Map<string, string[]>();
  for (const row of previews.rows) {
    const list = previewMap.get(row.folder) ?? [];
    list.push(`/api/assets/${row.id}/delivery`);
    previewMap.set(row.folder, list);
  }

  const persistent = await db
    .select()
    .from(assetFolders)
    .where(and(folderScope(tenantId, userId), isNull(assetFolders.trashedAt),
      ...(scopeFolder ? [sql`(${assetFolders.path}=${scopeFolder} or left(${assetFolders.path},${scopeFolder.length + 1})=${scopeFolder + "/"})`] : []),
      sql`not exists(select 1 from asset_folders parent where parent.library_id=${assetFolders.libraryId} and (${assetFolders.path}=parent.path or left(${assetFolders.path},length(parent.path)+1)=parent.path||'/') and (parent.trashed_at is not null or parent.expires_at<=now()))`));
  for (const f of persistent)
    if (!folders.some((x) => x.name === f.path))
      folders.push({ name: f.path, count: 0 });
  const { storageBytes, ...rest } = counts;
  return {
    folders: folders.map((f) => ({
      name: f.name!,
      count: f.count,
      previews: previewMap.get(f.name!) ?? [],
    })),
    counts: rest,
    storageBytes,
  };
}
