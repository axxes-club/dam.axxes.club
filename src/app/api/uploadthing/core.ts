import {enqueueStorageCleanup} from "@/lib/storage-cleanup";
import {
  libraryOwnership,
  assertFolderActive,
  ensureFolder,
  assertLibraryAccess,
} from "@/lib/library";
import { UTApi } from "uploadthing/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { db } from "@/lib/db";
import {
  assets,
  uploadSessions,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getViewer } from "@/lib/access";
import { assetTypeOf, normalizeFolder } from "@/lib/assets";
import { FOLDER_HEADER, TENANT_HEADER } from "@/lib/upload-headers";

import { viewerForUser } from "@/lib/account-viewer";

const f = createUploadthing();

async function assertUploadOwner(libraryId: string, userId: string, folder: string | null) {
  const viewer = await viewerForUser(userId);
  await assertLibraryAccess(viewer, libraryId, "write", folder);
}
function sessionLibrary(session: { tenantId: string | null; ownerUserId: string | null; createdById: string }) {
  return session.tenantId ?? (session.ownerUserId && session.ownerUserId !== session.createdById ? `user:${session.ownerUserId}` : "personal");
}

export const ourFileRouter = {
  handoffUploader: f({
    image: { acl: "private", maxFileSize: "16MB", maxFileCount: 10 },
  })
    .middleware(async ({ req }) => {
      // The handoff token is passed in a custom header
      const token = req.headers.get("x-handoff-token");
      if (!token) throw new UploadThingError("Unauthorized: No token");

      const [session] = await db
        .select()
        .from(uploadSessions)
        .where(eq(uploadSessions.token, token));
      if (!session) throw new UploadThingError("Unauthorized: Invalid token");
      if (session.expiresAt.getTime() < Date.now())
        throw new UploadThingError("Session expired");

      await assertUploadOwner(
        sessionLibrary(session),
        session.createdById,
        session.folder,
      );
      await assertFolderActive(
        sessionLibrary(session),
        session.createdById,
        session.folder,
      );
      return {
        tenantId: sessionLibrary(session),
        folder: session.folder,
        tokenId: session.id,
        tokenStr: session.token,
        userId: session.createdById,
        ownerUserId: session.ownerUserId,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      try {
      const [validSession] = await db
        .select()
        .from(uploadSessions)
        .where(eq(uploadSessions.id, metadata.tokenId));
      if (!validSession || validSession.expiresAt <= new Date())
        throw new UploadThingError("Session expired");
      await assertUploadOwner(metadata.tenantId, metadata.userId, metadata.folder);
      await assertFolderActive(
        metadata.tenantId,
        metadata.userId,
        metadata.folder,
      );
      await new UTApi().updateACL(file.key, "private");
      const [row] = await db
        .insert(assets)
        .values({
          ...libraryOwnership(metadata.tenantId, metadata.userId),
          uploadedById: metadata.userId,
          storageKey: file.key,
          uploadKey: file.key,
          name: file.name.replace(/\.[^.]+$/, "") || file.name,
          originalFilename: file.name,
          url: file.ufsUrl,
          mimeType: file.type || null,
          fileSize: file.size,
          folder: metadata.folder,
          category: assetTypeOf(file.type, null),
          source: "upload",
          tags: [],
        })
        .onConflictDoUpdate({
          target: assets.uploadKey,
          set: { uploadKey: file.key },
        })
        .returning({ id: assets.id });

      await db
        .update(uploadSessions)
        .set({
          photos: sql`(select coalesce(jsonb_agg(distinct item),'[]'::jsonb) from jsonb_array_elements(coalesce(${uploadSessions.photos},'[]'::jsonb) || ${JSON.stringify([`/api/assets/${row.id}/delivery`])}::jsonb) item)`,
        })
        .where(eq(uploadSessions.id, metadata.tokenId));

      return { assetId: row.id };
      }catch(error){ await enqueueStorageCleanup([file.key]); throw error; }
    }),

  assetUploader: f({
    image: { acl: "private", maxFileSize: "16MB", maxFileCount: 50 },
    video: { acl: "private", maxFileSize: "512MB", maxFileCount: 10 },
    audio: { acl: "private", maxFileSize: "64MB", maxFileCount: 20 },
    pdf: { acl: "private", maxFileSize: "64MB", maxFileCount: 20 },
    text: { acl: "private", maxFileSize: "4MB", maxFileCount: 20 },
    blob: { acl: "private", maxFileSize: "64MB", maxFileCount: 20 },
  })
    .middleware(async ({ req }) => {
      const viewer = await getViewer(req.headers);
      if (!viewer) throw new UploadThingError("Unauthorized");

      const libraryId = req.headers.get(TENANT_HEADER) || "personal";
      const rawFolder = req.headers.get(FOLDER_HEADER);
      const folder = normalizeFolder(rawFolder ? decodeURIComponent(rawFolder) : null);
      const tenant = await assertLibraryAccess(viewer, libraryId, "write", folder);

      await assertFolderActive(tenant.id, viewer.id, folder);
      await ensureFolder(tenant.id, viewer.id, folder);
      return { userId: viewer.id, tenantId: tenant.id, folder };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      try {
      await assertUploadOwner(metadata.tenantId, metadata.userId, metadata.folder);
      await assertFolderActive(
        metadata.tenantId,
        metadata.userId,
        metadata.folder,
      );
      await new UTApi().updateACL(file.key, "private");
      const [row] = await db
        .insert(assets)
        .values({
          ...libraryOwnership(metadata.tenantId, metadata.userId),
          uploadedById: metadata.userId,
          storageKey: file.key,
          uploadKey: file.key,
          name: file.name.replace(/\.[^.]+$/, "") || file.name,
          originalFilename: file.name,
          url: file.ufsUrl,
          mimeType: file.type || null,
          fileSize: file.size,
          folder: metadata.folder,
          category: assetTypeOf(file.type, null),
          source: "upload",
          tags: [],
        })
        .onConflictDoUpdate({
          target: assets.uploadKey,
          set: { uploadKey: file.key },
        })
        .returning({ id: assets.id });

      return { assetId: row.id };
      }catch(error){ await enqueueStorageCleanup([file.key]); throw error; }
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
