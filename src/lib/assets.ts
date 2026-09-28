import { sql, type SQL } from "drizzle-orm";
import { assets, type AssetRow } from "./db/schema";
import type { Asset, AssetType } from "./types";

export const ASSET_TYPES: AssetType[] = ["image", "video", "document", "other"];

// Folder filter value for assets with no folder
export const UNFILED = "__unfiled__";

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

export function toAsset(row: AssetRow): Asset {
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
    tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === "string") : [],
    folder: row.folder,
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
