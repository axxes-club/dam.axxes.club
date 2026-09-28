import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { guard } from "@/lib/api";

export async function GET(req: NextRequest) {
  const access = await guard(req.headers, req.nextUrl.searchParams.get("tenantId"));
  if ("error" in access) return access.error;

  const rows = await db.execute<{ tag: string }>(sql`
    select distinct jsonb_array_elements_text(${assets.tags}) as tag
    from ${assets}
    where ${assets.tenantId} = ${access.tenant.id} and jsonb_typeof(${assets.tags}) = 'array'
    order by tag
    limit 200
  `);
  return NextResponse.json({ tags: rows.rows.map((r) => r.tag) });
}
