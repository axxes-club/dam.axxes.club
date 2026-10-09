import {wrapAdmission} from '@/lib/security/admission-server';
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getViewer } from "@/lib/access";
import { db } from "@/lib/db";
import { uploadSessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function GETHandler(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const [session] = await db.select().from(uploadSessions).where(eq(uploadSessions.token, (await params).token));
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const expired = session.expiresAt.getTime() < Date.now();
  
  return NextResponse.json({
    photos: expired ? [] : (session.photos || []).filter(url=>url.startsWith("/api/assets/")).map(url => ({ url })),
    expiresAt: session.expiresAt.toISOString(),
    expired
  });
}

async function DELETEHandler(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const viewer = await getViewer(await headers());
  if (!viewer) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await db.delete(uploadSessions).where(
    and(eq(uploadSessions.token, (await params).token), eq(uploadSessions.createdById, viewer.id))
  );

  return NextResponse.json({ success: true });
}

export const GET=wrapAdmission(GETHandler,'src/app/api/upload-sessions/[token]/route.ts'+':GET',12000);

export const DELETE=wrapAdmission(DELETEHandler,'src/app/api/upload-sessions/[token]/route.ts'+':DELETE',3000);
