export type AssetType = 'image' | 'video' | 'document' | 'other';
export type AssetSort = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'largest' | 'smallest';

export const UNFILED = '__unfiled__';

export interface Asset {
  id: string;
  tenantId: string | null;
  ownerUserId?: string | null;
  uploadedById?: string | null;
  ownerName?: string | null;
  uploadedByName?: string | null;
  effectiveExpiresAt?: string | null;
  expiresAt?: string | null;
  trashedAt?: string | null;
  trashReason?: string | null;
  appKey?: string | null;
  storageKey?: string | null;
  name: string;
  description: string | null;
  altText: string | null;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  type: AssetType;
  source: string | null;
  originalFilename: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  folder: string | null;
  /**
   * Records in other AXXES apps that this file is attached to.
   *
   * A left join onto a link table Folders owns, so most files have none. Folders
   * cannot join onto another app's tables, so it holds (appKey, recordId) and
   * resolves it through a per-app URL registry — one mechanism for the whole
   * suite rather than a bespoke column per app.
   */
  appLinks?: AssetAppLink[];
}

export interface AssetAppLink {
  /** Catalog key of the owning app, e.g. "office". */
  appKey: string;
  recordId: string;
}

export interface AssetQuery {
  q?: string;
  type?: AssetType | null;
  folder?: string | null;
  sort?: AssetSort;
  offset?: number;
}

export interface AssetPage {
  assets: Asset[];
  total: number;
  nextOffset: number | null;
}

export interface FolderSummary {
  name: string;
  count: number;
  // Up to three recent image URLs, used for folder tile previews
  previews: string[];
  expiresAt?: string | null;
}

export interface FolderPolicy {
 trashReason?: string | null;
 id?: string;
 path: string;
 expiresAt: string | null;
 trashedAt: string | null;
}

export interface Overview {
  folderPolicies?: FolderPolicy[];
  folders: FolderSummary[];
  counts: { all: number; image: number; video: number; document: number; unfiled: number };
  storageBytes: number;
}

export interface TenantAccess {
  canManage?: boolean;
  folder?: string | null;
  id: string;
  name: string;
  role: string;
  canWrite: boolean;
  canDelete: boolean;
}

export interface Viewer {
  id: string;
  name: string;
  email: string;
  image: string | null;
  isSuperadmin: boolean;
  tenants: TenantAccess[];
}
