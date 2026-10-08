import {wrapAdmission} from '@/lib/security/admission-server';
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { verifyShareToken } from "@/lib/share";
import { libraryScope, assetVisibleCondition } from "@/lib/library";
import { deliverAsset } from "@/lib/delivery";
export const dynamic = "force-dynamic";
async function GETHandler(
  req: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const p = verifyShareToken((await params).token);
  if (!p) return new Response(null, { status: 404 });
  if (p.k === "asset" && p.id !== (await params).id)
    return new Response(null, { status: 404 });
  const [row] = await db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.id, (await params).id),
        libraryScope(p.t, p.u ?? ""),
        assetVisibleCondition(),
        ...(p.k === "folder" ? [eq(assets.folder, p.f)] : []),
      ),
    );
  if (!row) return new Response(null, { status: 404 });
  return deliverAsset(row);
}

export const GET=wrapAdmission(GETHandler,'src/app/api/share/[token]/assets/[id]/route.ts'+':GET',12000);
