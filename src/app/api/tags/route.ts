import { libraryScope, assetVisibleCondition } from "@/lib/library";
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { guard } from "@/lib/api";

export async function GET(req: NextRequest) {
  const folder = req.nextUrl.searchParams.get("folder");
  const access = await guard(req.headers, req.nextUrl.searchParams.get("tenantId"), "read", folder);
  if ("error" in access) return access.error;

  const rows = await db.execute<{ tag: string }>(sql`
    select distinct jsonb_array_elements_text(${assets.tags}) as tag
    from ${assets}
    where ${libraryScope(access.tenant.id,access.viewer.id)} and ${assetVisibleCondition()} and jsonb_typeof(${assets.tags}) = 'array'
    ${access.tenant.role === "shared" && folder ? sql`and (${assets.folder}=${folder} or left(${assets.folder},${folder.length + 1})=${folder + "/"})` : sql``}
    order by tag
    limit 200
  `);
  return NextResponse.json({ tags: rows.rows.map((r) => r.tag) });
}
