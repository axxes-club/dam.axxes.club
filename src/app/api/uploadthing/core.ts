import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { getViewer, tenantAccess } from "@/lib/access";
import { assetTypeOf, normalizeFolder } from "@/lib/assets";
import { FOLDER_HEADER, TENANT_HEADER } from "@/lib/upload-headers";

const f = createUploadthing();

export const ourFileRouter = {
  assetUploader: f({
    image: { maxFileSize: "16MB", maxFileCount: 20 },
    video: { maxFileSize: "256MB", maxFileCount: 5 },
    pdf: { maxFileSize: "32MB", maxFileCount: 10 },
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
          mimeType: file.type,
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
