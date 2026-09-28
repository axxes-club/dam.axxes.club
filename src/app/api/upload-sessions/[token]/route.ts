import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getViewer } from "@/lib/access";
import { db } from "@/lib/db";
import { uploadSessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const [session] = await db.select().from(uploadSessions).where(eq(uploadSessions.token, params.token));
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const expired = session.expiresAt.getTime() < Date.now();
  
  return NextResponse.json({
    photos: (session.photos || []).map(url => ({ url })),
    expiresAt: session.expiresAt.toISOString(),
    expired
  });
}

export async function DELETE(req: Request, { params }: { params: { token: string } }) {
  const viewer = await getViewer(headers());
  if (!viewer) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await db.delete(uploadSessions).where(
    and(eq(uploadSessions.token, params.token), eq(uploadSessions.createdById, viewer.id))
  );

  return NextResponse.json({ success: true });
}
