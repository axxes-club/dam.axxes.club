import { NextResponse, type NextRequest } from "next/server";
import { and, asc, count, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { getViewer, tenantAccess } from "@/lib/access";
import type { FolderSummary } from "@/lib/types";

export async function GET(req: NextRequest) {
  const viewer = await getViewer(req.headers);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = tenantAccess(viewer, req.nextUrl.searchParams.get("tenantId"));
  if (!tenant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({ name: assets.folder, count: count() })
    .from(assets)
    .where(and(eq(assets.tenantId, tenant.id), isNotNull(assets.folder)))
    .groupBy(assets.folder)
    .orderBy(asc(assets.folder));

  const folders: FolderSummary[] = rows.map((r) => ({ name: r.name!, count: r.count }));
  return NextResponse.json({ folders });
}
