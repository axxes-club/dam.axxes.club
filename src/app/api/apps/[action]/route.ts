import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, assetAppGrants, assetAppLinks, foldersUploadIntents } from "@/lib/db/schema";
import { getViewer } from "@/lib/access";
import { verifyEnvelope } from "@/lib/apps/envelope";
import { ASSET_APPS } from "@/lib/apps/registry";
import { viewerForUser } from "@/lib/account-viewer";
import { assertLibraryAccess, assertFolderActive, ensureFolder, libraryOwnership, libraryScope, assetVisibleCondition, authorizeAsset, sharedFolderDestinations } from "@/lib/library";
import { normalizeFolder, assetTypeOf } from "@/lib/assets";
import { deliverAsset } from "@/lib/delivery";
import { completedFile } from "@/lib/apps/completed-file";
import { enqueueStorageCleanup } from "@/lib/storage-cleanup";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assetResult = (row: typeof assets.$inferSelect) => ({ id: row.id, name: row.originalFilename || row.name, mimeType: row.mimeType, folder: row.folder, size: row.fileSize, expiresAt: row.expiresAt?.toISOString() || null });
async function grant(appKey: string, assetId: string, recordId: string, audienceTenantId: string) {
  await db.insert(assetAppGrants).values({ assetId, appKey, recordId, audienceTenantId }).onConflictDoNothing();
  // Legacy app links are one-per-app; grants retain every individual usage.
  await db.insert(assetAppLinks).values({ assetId, appKey, recordId, tenantId: audienceTenantId }).onConflictDoNothing();
}
export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  try {
    const body = await req.json().catch(() => null);
    const registeredKey = typeof body?.appKey === "string" ? body.appKey : "";
    const app = Object.hasOwn(ASSET_APPS, registeredKey) ? ASSET_APPS[registeredKey] : null;
    const p = app && typeof body?.token === "string" ? verifyEnvelope(body.token, process.env.BETTER_AUTH_SECRET || "", registeredKey) : null;
    const action = params.action;
    if (!app || !p || p.action !== action) return NextResponse.json({ error: "Invalid app authorization" }, { status: 401 });

    const appKey = p.appKey;
    if (action === "complete") {
      const reported = p.file as { key?: unknown } | undefined;
      try {
      if (typeof p.intentId !== "string" || !uuid.test(p.intentId)) throw new Error("Upload authorization missing");
      const [intent] = await db.select().from(foldersUploadIntents).where(and(eq(foldersUploadIntents.id, p.intentId), eq(foldersUploadIntents.appKey, appKey)));
      if (!intent || intent.expiresAt <= new Date()) throw new Error("Upload authorization expired");
      await app.validateRecord(intent.userId, intent.recordId, intent.audienceTenantId, true);
      const viewer = await viewerForUser(intent.userId);
      await assertLibraryAccess(viewer, intent.libraryId, "write", intent.folder);
      await assertFolderActive(intent.libraryId, viewer.id, intent.folder);
      const file = completedFile(p.file);
      const uploadKey = `${intent.id}:${file.key}`;
      const values = { ...libraryOwnership(intent.libraryId, intent.userId), name: file.name.slice(0, 255), originalFilename: file.name.slice(0, 255),
        uploadedById: intent.userId, folder: intent.folder, expiresAt: intent.assetExpiresAt,
        appKey, storageKey: file.key, uploadKey, url: file.url, mimeType: typeof file.type === "string" ? file.type : null,
        fileSize: file.size, source: "upload", category: assetTypeOf(typeof file.type === "string" ? file.type : null, null), tags: [] };
      const [inserted] = await db.insert(assets).values(values).onConflictDoNothing({ target: assets.uploadKey }).returning();
      const row = inserted || (await db.select().from(assets).where(eq(assets.uploadKey, uploadKey)))[0];
      if (!row) throw new Error("Upload could not be registered");
      await grant(appKey, row.id, intent.recordId, intent.audienceTenantId);
      return NextResponse.json(assetResult(row));
      } catch (error) {
        if (typeof reported?.key === "string" && /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,255}$/.test(reported.key)) await enqueueStorageCleanup([reported.key]);
        throw error;
      }
    }

    const viewer = await getViewer(req.headers);
    if (!viewer || p.userId !== viewer.id) return NextResponse.json({ error: "Sign in to use Folders" }, { status: 401 });
    if (typeof p.recordId !== "string" || typeof p.audienceTenantId !== "string" || !uuid.test(p.recordId) || !uuid.test(p.audienceTenantId)) throw new Error("Page required");
    await app.validateRecord(viewer.id, p.recordId, p.audienceTenantId, ["authorize", "attach", "copy"].includes(action));

    if (action === "destinations") {
      const shared = await sharedFolderDestinations(viewer);
      return NextResponse.json({ destinations: [...viewer.tenants.map(t => ({ id: t.id, name: t.name, canWrite: t.canWrite, owner: t.id === "personal" ? viewer.name : t.name })), ...shared.filter(r => r.canRead).map(r => ({ id: r.libraryId, name: `Shared: ${r.folder}`, owner: r.ownerUserId || viewer.tenants.find(t => t.id === r.tenantId)?.name || "Workspace owner", canWrite: r.canWrite, folder: r.folder }))], foldersUrl: req.nextUrl.origin, preferenceKey: `axxes:asset-destination:${appKey}:${viewer.id}` });
    }
    const libraryId = typeof p.libraryId === "string" ? p.libraryId : "personal";
    const folder = normalizeFolder(p.folder);
    if (action === "authorize") {
      await assertLibraryAccess(viewer, libraryId, "write", folder);
      const path = folder || `/Apps/${app.name}`;
      await ensureFolder(libraryId, viewer.id, path);
      await assertFolderActive(libraryId, viewer.id, path);
      let assetExpiresAt: Date | null = null;
      if (p.expiresAt) {
        assetExpiresAt = new Date(String(p.expiresAt));
        if (!Number.isFinite(assetExpiresAt.getTime()) || assetExpiresAt <= new Date()) throw new Error("Choose a future expiration date");
      }
      if (typeof p.intentId === "string" && uuid.test(p.intentId)) {
        const [existing] = await db.select().from(foldersUploadIntents).where(and(eq(foldersUploadIntents.id, p.intentId), eq(foldersUploadIntents.userId, viewer.id), eq(foldersUploadIntents.recordId, p.recordId), eq(foldersUploadIntents.appKey, appKey)));
        if (!existing || existing.expiresAt <= new Date() || existing.libraryId !== libraryId || existing.folder !== path) throw new Error("Phone upload authorization expired or destination changed");
        return NextResponse.json({ intentId: existing.id, expiresAt: existing.expiresAt.toISOString(), libraryId, folder: path });
      }
      const [intent] = await db.insert(foldersUploadIntents).values({ appKey, recordId: p.recordId, audienceTenantId: p.audienceTenantId, userId: viewer.id, libraryId, folder: path, expiresAt: new Date(Date.now() + 30 * 60_000), assetExpiresAt }).returning();
      return NextResponse.json({ intentId: intent.id, expiresAt: intent.expiresAt.toISOString(), libraryId, folder: path });
    }
    if (action === "assets") {
      await assertLibraryAccess(viewer, libraryId, "read", folder);
      const rows = await db.select().from(assets).where(and(libraryScope(libraryId, viewer.id), assetVisibleCondition(), ...(folder ? [eq(assets.folder, folder)] : []))).orderBy(desc(assets.createdAt)).limit(60);
      return NextResponse.json({ assets: rows.map(assetResult) });
    }
    if (action === "attach") {
      if (typeof p.assetId !== "string" || !uuid.test(p.assetId)) throw new Error("Asset required");
      const row = await authorizeAsset(viewer, p.assetId, "read");
      await grant(appKey, row.id, p.recordId, p.audienceTenantId);
      return NextResponse.json(assetResult(row));
    }
    if (action === "uploads") {
      if (typeof p.intentId !== "string" || !uuid.test(p.intentId)) throw new Error("Upload authorization missing");
      const [intent] = await db.select().from(foldersUploadIntents).where(and(eq(foldersUploadIntents.id, p.intentId), eq(foldersUploadIntents.userId, viewer.id), eq(foldersUploadIntents.recordId, p.recordId)));
      if (!intent || intent.expiresAt <= new Date()) throw new Error("Phone upload session expired");
      const rows = await db.select().from(assets).where(and(eq(assets.uploadedById, viewer.id), sql`${assets.uploadKey} like ${intent.id + ":%"}`, assetVisibleCondition()));
      return NextResponse.json({ assets: rows.map(assetResult), expiresAt: intent.expiresAt.toISOString() });
    }
    if (action === "copy") {
      if (typeof p.toRecordId !== "string" || !uuid.test(p.toRecordId)) throw new Error("New page required");
      await app.validateRecord(viewer.id, p.toRecordId, p.audienceTenantId, true);
      const links = await db.select({ assetId: assetAppGrants.assetId }).from(assetAppGrants).where(and(eq(assetAppGrants.appKey, appKey), eq(assetAppGrants.recordId, p.recordId), eq(assetAppGrants.audienceTenantId, p.audienceTenantId)));
      for (const link of links) await grant(appKey, link.assetId, p.toRecordId, p.audienceTenantId);
      return NextResponse.json({ count: links.length });
    }
    if (action === "deliver") {
      if (typeof p.assetId !== "string" || !uuid.test(p.assetId)) throw new Error("Asset required");
      const [link] = await db.select().from(assetAppGrants).where(and(eq(assetAppGrants.assetId, p.assetId), eq(assetAppGrants.appKey, appKey), eq(assetAppGrants.recordId, p.recordId), eq(assetAppGrants.audienceTenantId, p.audienceTenantId), sql`(${assetAppGrants.expiresAt} is null or ${assetAppGrants.expiresAt}>now())`));
      if (!link) throw new Error("Attachment access denied");
      const [row] = await db.select().from(assets).where(and(eq(assets.id, p.assetId), assetVisibleCondition()));
      if (!row) throw new Error("Attachment unavailable");
      return await deliverAsset(row);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Folders unavailable" }, { status: 400 });
  }
}
