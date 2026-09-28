import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { db } from "@/lib/db";
import { assets, uploadSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getViewer, tenantAccess } from "@/lib/access";
import { assetTypeOf, normalizeFolder } from "@/lib/assets";
import { FOLDER_HEADER, TENANT_HEADER } from "@/lib/upload-headers";

const f = createUploadthing();

export const ourFileRouter = {
  handoffUploader: f({
    image: { maxFileSize: "16MB", maxFileCount: 10 },
  })
    .middleware(async ({ req }) => {
      // The handoff token is passed in a custom header
      const token = req.headers.get("x-handoff-token");
      if (!token) throw new UploadThingError("Unauthorized: No token");

      const [session] = await db.select().from(uploadSessions).where(eq(uploadSessions.token, token));
      if (!session) throw new UploadThingError("Unauthorized: Invalid token");
      if (session.expiresAt.getTime() < Date.now()) throw new UploadThingError("Session expired");

      return { tenantId: session.tenantId, folder: session.folder, tokenId: session.id, tokenStr: session.token };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const [row] = await db
        .insert(assets)
        .values({
          tenantId: metadata.tenantId,
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
        .returning({ id: assets.id });

      // Update the session photos array with the new URL so the desktop can poll it
      const [session] = await db.select().from(uploadSessions).where(eq(uploadSessions.id, metadata.tokenId));
      if (session) {
        const photos = session.photos || [];
        await db.update(uploadSessions).set({ photos: [...photos, file.ufsUrl] }).where(eq(uploadSessions.id, metadata.tokenId));
      }

      return { assetId: row.id };
    }),

  assetUploader: f({
    image: { maxFileSize: "16MB", maxFileCount: 50 },
    video: { maxFileSize: "512MB", maxFileCount: 10 },
    audio: { maxFileSize: "64MB", maxFileCount: 20 },
    pdf: { maxFileSize: "64MB", maxFileCount: 20 },
    text: { maxFileSize: "4MB", maxFileCount: 20 },
    blob: { maxFileSize: "64MB", maxFileCount: 20 },
  })
    .middleware(async ({ req }) => {
      const viewer = await getViewer(req.headers);
      if (!viewer) throw new UploadThingError("Unauthorized");

      const tenant = tenantAccess(viewer, req.headers.get(TENANT_HEADER));
      if (!tenant?.canWrite) throw new UploadThingError("You can't upload to this workspace");

      const rawFolder = req.headers.get(FOLDER_HEADER);
      const folder = normalizeFolder(rawFolder ? decodeURIComponent(rawFolder) : null);

      return { userId: viewer.id, tenantId: tenant.id, folder };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const [row] = await db
        .insert(assets)
        .values({
          tenantId: metadata.tenantId,
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
        .returning({ id: assets.id });

      return { assetId: row.id };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
