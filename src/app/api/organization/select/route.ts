import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getViewer, tenantAccess } from "@/lib/access";
export async function POST(request: Request) {
  const viewer = await getViewer(await headers());
  if (!viewer) return NextResponse.json({}, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({}, { status: 400 }); }
  const id = body && typeof body === "object" ? (body as { id?: unknown }).id : undefined;
  if (typeof id !== "string") return NextResponse.json({}, { status: 400 });
  if (!tenantAccess(viewer, id)) return NextResponse.json({}, { status: 403 });
  const response = NextResponse.json({ success: true });
  response.cookies.set("folders_tenant_id", id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 31536000 });
  return response;
}
