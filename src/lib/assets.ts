import { asc, desc, sql, type SQL } from "drizzle-orm";
import { assets, type AssetRow } from "./db/schema";
import { UNFILED, type Asset, type AssetAppLink, type AssetSort, type AssetType } from "./types";

export const ASSET_TYPES: AssetType[] = ["image", "video", "document", "other"];

export { UNFILED };
export const PAGE_SIZE = 60;

export function assetTypeOf(mimeType: string | null, category: string | null): AssetType {
  const mime = mimeType ?? "";
  if (mime.startsWith("image/") || category === "image") return "image";
  if (mime.startsWith("video/") || category === "video") return "video";
  if (mime.startsWith("application/") || mime.startsWith("text/") || category === "document") return "document";
  return "other";
}

// SQL mirror of assetTypeOf, so filtering happens in the database.
export function assetTypeCondition(type: AssetType): SQL {
  const mime = sql`coalesce(${assets.mimeType}, '')`;
  const isImage = sql`(${mime} like 'image/%' or ${assets.category} = 'image')`;
  const isVideo = sql`(${mime} like 'video/%' or ${assets.category} = 'video')`;
  const isDocument = sql`(${mime} like 'application/%' or ${mime} like 'text/%' or ${assets.category} = 'document')`;
  switch (type) {
    case "image":
      return isImage;
    case "video":
      return sql`(${isVideo} and not ${isImage})`;
    case "document":
      return sql`(${isDocument} and not ${isImage} and not ${isVideo})`;
    case "other":
      return sql`(not ${isImage} and not ${isVideo} and not ${isDocument})`;
  }
}

export function assetOrderBy(sort: AssetSort | undefined) {
  switch (sort) {
    case "oldest":
      return [asc(assets.createdAt), asc(assets.id)];
    case "name-asc":
      return [asc(sql`lower(${assets.name})`), asc(assets.id)];
    case "name-desc":
      return [desc(sql`lower(${assets.name})`), desc(assets.id)];
    case "largest":
      return [sql`${assets.fileSize} desc nulls last`, desc(assets.id)];
    case "smallest":
      return [sql`${assets.fileSize} asc nulls last`, asc(assets.id)];
    default:
      return [desc(assets.createdAt), desc(assets.id)];
  }
}

/**
 * The records in other AXXES apps this file is attached to. Passed separately
 * because they arrive from a subquery, and a file with no links must still come
 * back complete.
 */
export function toAsset(row: AssetRow, appLinks?: AssetAppLink[]): Asset {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    altText: row.altText,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl,
    mimeType: row.mimeType,
    size: row.fileSize,
    width: row.width,
    height: row.height,
    type: assetTypeOf(row.mimeType, row.category),
    source: row.source,
    originalFilename: row.originalFilename,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === "string") : [],
    folder: row.folder,
    appLinks: appLinks ?? [],
  };
}

export function normalizeFolder(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, 120);
  return trimmed || null;
}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags = value
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase().slice(0, 50))
    .filter(Boolean);
  return Array.from(new Set(tags)).slice(0, 50);
}

// UploadThing file URLs end in /f/<fileKey>
export function uploadthingKey(url: string): string | null {
  const match = url.match(/\/f\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
