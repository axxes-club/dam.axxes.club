import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { verifyShareToken } from "@/lib/share";
import { libraryScope, assetVisibleCondition } from "@/lib/library";
import { deliverAsset } from "@/lib/delivery";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: { token: string; id: string } },
) {
  const p = verifyShareToken(params.token);
  if (!p) return new Response(null, { status: 404 });
  if (p.k === "asset" && p.id !== params.id)
    return new Response(null, { status: 404 });
  const [row] = await db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.id, params.id),
        libraryScope(p.t, p.u ?? ""),
        assetVisibleCondition(),
        ...(p.k === "folder" ? [eq(assets.folder, p.f)] : []),
      ),
    );
  if (!row) return new Response(null, { status: 404 });
  return deliverAsset(row);
}
