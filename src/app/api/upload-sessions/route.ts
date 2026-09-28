import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getViewer, tenantAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { uploadSessions } from "@/lib/db/schema";
import { baseUrlFrom, createToken, expiryFromNow, qrSvg } from "@/lib/upload-session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const viewer = await getViewer(headers());
  if (!viewer) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tenantId = body.tenantId;
  const folder = body.folder || null;
  
  const tenant = tenantAccess(viewer, tenantId);
  if (!tenant?.canWrite) {
    return NextResponse.json({ error: "Not yours to change" }, { status: 403 });
  }

  const token = createToken();
  const expiresAt = expiryFromNow();

  await db.insert(uploadSessions).values({
    token,
    tenantId,
    folder,
    createdById: viewer.id,
    expiresAt,
  });

  const url = `${baseUrlFrom(req)}/m/${token}`;

  return NextResponse.json({
    token,
    url,
    expiresAt: expiresAt.toISOString(),
    qr: await qrSvg(url)
  });
}
