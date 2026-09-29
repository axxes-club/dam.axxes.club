/**
 * Where an AXXES app lives, and how to point at a record inside it.
 *
 * Folders holds `asset_app_links(asset_id, app_key, record_id)` and cannot join
 * onto tables it does not own, so it resolves a link through this registry
 * rather than knowing anything about any app's schema. Adding an app to the
 * suite is one entry here.
 *
 * Everything in here is free to use with any AXXES account: these are the
 * suite's own products, and nothing about them is behind a plan.
 */
export type AppLinkTarget = {
  /** The app's origin, for surfaces that link to a page rather than a record. */
  base: string
  /** Shown in the folder's "Open in …" menu. */
  name: string
  /** Where the record lives. */
  url: (recordId: string, tenantId?: string | null) => string
  /** A read-only view, if the app has one. Omitted means no QuickLook. */
  quickLook?: (recordId: string, tenantId?: string | null) => string
  /**
   * Whether an unlinked file can still be opened, because the app will create
   * the record on first use. Null means the item only appears once linked.
   */
  openUnlinked?: (assetId: string, tenantId?: string | null) => string
}

const withTenant = (path: string, tenantId?: string | null) =>
  tenantId ? `${path}?tenant=${tenantId}` : path

export const APP_LINK_TARGETS: Record<string, AppLinkTarget> = {
  office: {
    name: "AXXES Office",
    base: "https://quill.axxes.club",
    url: (id, tenant) => withTenant(`https://quill.axxes.club/d/${id}`, tenant),
    quickLook: (id, tenant) => withTenant(`https://quill.axxes.club/quicklook/${id}`, tenant),
    openUnlinked: (assetId, tenant) => withTenant(`https://quill.axxes.club/open?asset=${assetId}`, tenant),
  },
  lanes: {
    name: "Lanes",
    base: "https://lanes.axxes.club",
    url: (id, tenant) => withTenant(`https://lanes.axxes.club/boards/${id}`, tenant),
  },
  nexus: {
    name: "Nexus",
    base: "https://nexus.axxes.club",
    url: (id, tenant) => withTenant(`https://nexus.axxes.club/pages/${id}`, tenant),
  },
  pulse: {
    name: "Pulse",
    base: "https://pulse.axxes.club",
    url: (_id, tenant) => withTenant("https://pulse.axxes.club/", tenant),
  },
  manifest: {
    name: "Manifest",
    base: "https://manifest.axxes.club",
    url: (_id, tenant) => withTenant("https://manifest.axxes.club/", tenant),
  },
}

/** The target for a link, or null for an app key this build does not know. */
export function appTarget(appKey: string): AppLinkTarget | null {
  return APP_LINK_TARGETS[appKey] ?? null
}
