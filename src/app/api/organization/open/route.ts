import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { and, eq, isNull } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { tenants, tenantMemberships } from "@/lib/db/schema"
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("tenant")
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "Invalid organization" }, { status: 400 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.redirect(new URL("/sign-in", request.url))
  const [membership] = await db.select({ id: tenants.id, settings: tenants.settings }).from(tenantMemberships)
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .where(and(eq(tenantMemberships.userId, session.user.id), eq(tenantMemberships.tenantId, id), isNull(tenantMemberships.deletedAt), isNull(tenants.deletedAt), eq(tenants.status, "active"))).limit(1)
  if (!membership || membership.settings?.features?.folders === false) return NextResponse.json({ error: "Organization access unavailable" }, { status: 403 })
  const response = NextResponse.redirect(new URL("/", request.url))
  response.cookies.set("folders_tenant_id", id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 31536000 })
  return response
}
