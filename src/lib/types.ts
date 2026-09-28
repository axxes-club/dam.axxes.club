export type AssetType = 'image' | 'video' | 'document' | 'other';
export type AssetSort = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'largest' | 'smallest';

export const UNFILED = '__unfiled__';

export interface Asset {
  id: string;
  tenantId: string;
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
}

export interface Overview {
  folders: FolderSummary[];
  counts: { all: number; image: number; video: number; document: number; unfiled: number };
  storageBytes: number;
}

export interface TenantAccess {
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
