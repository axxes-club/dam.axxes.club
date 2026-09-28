import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { guard, jsonError } from "@/lib/api";
import { normalizeFolder } from "@/lib/assets";
import { createShareToken } from "@/lib/share";

const DAYS = new Set([1, 7, 30, 365]);

// { tenantId, target: { kind: "asset", id } | { kind: "folder", folder }, days }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const access = await guard(req.headers, body?.tenantId, "write");
  if ("error" in access) return access.error;

  const days = Number(body?.days);
  if (!DAYS.has(days)) return jsonError("Invalid expiry", 400);
  const exp = Date.now() + days * 24 * 60 * 60 * 1000;
  const tenantId = access.tenant.id;

  let token: string;
  if (body?.target?.kind === "asset") {
    const [row] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, String(body.target.id)), eq(assets.tenantId, tenantId)))
      .catch(() => []);
    if (!row) return jsonError("File not found", 404);
    token = createShareToken({ k: "asset", t: tenantId, id: row.id, exp });
  } else if (body?.target?.kind === "folder") {
    const folder = normalizeFolder(body.target.folder);
    if (!folder) return jsonError("Folder is required", 400);
    token = createShareToken({ k: "folder", t: tenantId, f: folder, exp });
  } else {
    return jsonError("Invalid share target", 400);
  }

  return NextResponse.json({ url: `${req.nextUrl.origin}/share/${token}`, expiresAt: new Date(exp).toISOString() });
}
