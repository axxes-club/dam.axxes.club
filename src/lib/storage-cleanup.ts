import { deleteStoredUrls, stableAssetUrl, storageAdapter } from "./gcs/server";
import { eq, lte, sql } from "drizzle-orm";
import { UTApi } from "uploadthing/server";
import { db } from "./db";
import { assets, folderStorageCleanup } from "./db/schema";
export async function enqueueStorageCleanup(keys: string[]): Promise<void> {
  const unique = Array.from(new Set(keys.filter(Boolean)));
  if (!unique.length) return;
  await db
    .insert(folderStorageCleanup)
    .values(unique.map((storageKey) => ({ storageKey })))
    .onConflictDoNothing();
}
export async function processStorageCleanup(
  limit = 50,
  deleteFiles?: (key: string) => Promise<boolean>,
  database: typeof db = db,
): Promise<{ deleted: number; pending: number }> {
  const now = new Date();
  const rows = await database
    .select()
    .from(folderStorageCleanup)
    .where(lte(folderStorageCleanup.nextAttemptAt, now))
    .limit(limit);
  let deleted = 0;
  for (const row of rows) {
    const references = await database
      .select({ id: assets.id })
      .from(assets)
      .where(
        sql`${assets.storageKey}=${row.storageKey} or substring(${assets.url} from '/f/([^/?#]+)')=${row.storageKey}`,
      )
      .limit(1);
    if (references.length) {
      await database
        .update(folderStorageCleanup)
        .set({
          nextAttemptAt: new Date(Date.now() + 3600000),
          updatedAt: new Date(),
        })
        .where(eq(folderStorageCleanup.storageKey, row.storageKey));
      continue;
    }
    try {
      if (!deleteFiles && !row.storageKey.startsWith("uploads/") && !process.env.UPLOADTHING_TOKEN)
        throw new Error("UPLOADTHING_TOKEN not configured");
      const success = deleteFiles
        ? await deleteFiles(row.storageKey)
        : row.storageKey.startsWith("uploads/")
          ? (await deleteStoredUrls([stableAssetUrl(row.storageKey)])) > 0 || !(await storageAdapter().store.stat(row.storageKey))
          : (await new UTApi().deleteFiles(row.storageKey)).success;
      if (!success) throw new Error("Storage did not confirm deletion");
      await database
        .delete(folderStorageCleanup)
        .where(eq(folderStorageCleanup.storageKey, row.storageKey));
      deleted++;
    } catch (error) {
      await database
        .update(folderStorageCleanup)
        .set({
          attempts: row.attempts + 1,
          lastError:
            error instanceof Error ? error.message : "Storage deletion failed",
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(86400000, 60000 * 2 ** Math.min(row.attempts, 10)),
          ),
          updatedAt: new Date(),
        })
        .where(eq(folderStorageCleanup.storageKey, row.storageKey));
    }
  }
  const [counts] = await database
    .select({ pending: sql<number>`count(*)`.mapWith(Number) })
    .from(folderStorageCleanup);
  return { deleted, pending: counts.pending };
}
