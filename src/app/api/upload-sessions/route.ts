import {wrapAdmission} from '@/lib/security/admission-server';
import { libraryOwnership,assertFolderActive,ensureFolder,assertLibraryAccess } from "@/lib/library";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getViewer } from "@/lib/access";
import { db } from "@/lib/db";
import { uploadSessions } from "@/lib/db/schema";
import { baseUrlFrom, createToken, expiryFromNow, qrSvg } from "@/lib/upload-session";

export const dynamic = "force-dynamic";

async function POSTHandler(req: Request) {
  const viewer = await getViewer(await headers());
  if (!viewer) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tenantId = body.tenantId;
  const folder = body.folder || null;
  
  try { await assertLibraryAccess(viewer, tenantId, "write", folder); } catch {
    return NextResponse.json({ error: "Not yours to change" }, { status: 403 });
  }

  await assertFolderActive(tenantId,viewer.id,folder);
  await ensureFolder(tenantId,viewer.id,folder);
  const token = createToken();
  const expiresAt = expiryFromNow();

  await db.insert(uploadSessions).values({
    token,
    ...libraryOwnership(tenantId,viewer.id),
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

export const POST=wrapAdmission(POSTHandler,'src/app/api/upload-sessions/route.ts'+':POST',3000);
