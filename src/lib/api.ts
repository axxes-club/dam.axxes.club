import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { keyForUrl } from "@/lib/gcs/server";
import { enqueueStorageCleanup, processStorageCleanup } from "./storage-cleanup";
import { db } from "./db";
import { assets } from "./db/schema";
import { getViewer, tenantAccess } from "./access";
import type { TenantAccess, Viewer } from "./types";
import { assertLibraryAccess } from "./library";

type Need = "read" | "write" | "delete";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

// Resolves the signed-in viewer and their access to a workspace, or an error response.
export async function guard(
  headers: Headers,
  tenantId: string | null | undefined,
  need: Need = "read",
  folder?: string | null,
): Promise<{ viewer: Viewer; tenant: TenantAccess } | { error: NextResponse }> {
  const viewer = await getViewer(headers);
  if (!viewer) return { error: jsonError("Unauthorized", 401) };

  let tenant = tenantAccess(viewer, tenantId);
  if (!tenant && tenantId && folder && need !== "delete") {
    try {
      tenant = await assertLibraryAccess(viewer, tenantId, need, folder);
    } catch {}
  }
  if (!tenant) return { error: jsonError("Forbidden", 403) };
  if (need === "write" && !tenant.canWrite)
    return { error: jsonError("You can't edit files in this workspace", 403) };
  if (need === "delete" && !tenant.canDelete)
    return {
      error: jsonError("You can't delete files in this workspace", 403),
    };

  return { viewer, tenant };
}

export function cleanIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const uuid = /^[0-9a-f-]{36}$/i;
  return Array.from(
    new Set(
      ids.filter((id): id is string => typeof id === "string" && uuid.test(id)),
    ),
  ).slice(0, 500);
}

// Files uploaded here are removed from storage once no asset (e.g. a duplicate) still points at them.
export async function removeOrphanedUploads(rows: { url: string; source: string | null }[]) {
  const urls = Array.from(new Set(rows.filter((r) => r.source === "upload").map((r) => r.url)));
  if (!urls.length) return;

  const stillUsed = await db
    .select({ url: assets.url })
    .from(assets)
    .where(inArray(assets.url, urls));
  const used = new Set(stillUsed.map((r) => r.url));
  const orphaned = urls.filter((u) => !used.has(u));
  if (!orphaned.length) return;
  const keys = (await Promise.all(orphaned.map(async url => {
    const mapped = await keyForUrl(url);
    if (mapped) return mapped.startsWith("uploads/") ? mapped : null;
    return /\/f\/([^/?#]+)/.exec(url)?.[1] ?? null;
  }))).filter((key): key is string => !!key);
  await enqueueStorageCleanup(keys);
  await processStorageCleanup();
}
