export type AssetType = 'image' | 'video' | 'document' | 'other';

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
  tags: string[];
  folder: string | null;
}

export interface FolderSummary {
  name: string;
  count: number;
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
  isSuperadmin: boolean;
  tenants: TenantAccess[];
}

export interface AssetPage {
  assets: Asset[];
  total: number;
  nextOffset: number | null;
}
