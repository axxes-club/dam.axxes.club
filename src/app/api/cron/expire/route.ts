import {processStorageCleanup} from "@/lib/storage-cleanup";
import { NextResponse } from "next/server";
import { and, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, assetFolders } from "@/lib/db/schema";
import { assetVisibleCondition } from "@/lib/library";
export async function POST(req: Request) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return new NextResponse(null, { status: 401 });
  const now = new Date();
  const folders = await db
    .update(assetFolders)
    .set({ trashedAt: now, trashReason: "expired" })
    .where(
      and(
        isNull(assetFolders.trashedAt),
        sql`${assetFolders.expiresAt}<=${now}`,
      ),
    )
    .returning({ id: assetFolders.id });
  const rows = await db
    .update(assets)
    .set({ trashedAt: now, trashReason: "expired", updatedAt: now })
    .where(
      and(isNull(assets.trashedAt), sql`not (${assetVisibleCondition(now)})`),
    )
    .returning({ id: assets.id });
  const cleanup=await processStorageCleanup();
  return NextResponse.json({ assets: rows.length, folders: folders.length,cleanup });
}

export const GET=POST;
