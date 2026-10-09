import {wrapAdmission} from '@/lib/security/admission-server';
import { deliverAsset } from "@/lib/delivery";
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/access";
import { authorizeAsset } from "@/lib/library";
export const dynamic = "force-dynamic";
async function GETHandler(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getViewer(req.headers);
  if (!viewer) return new NextResponse(null, { status: 401 });
  let row;
  try {
    row = await authorizeAsset(viewer, (await params).id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  return deliverAsset(row, undefined, req);
}

export const GET=wrapAdmission(GETHandler,'src/app/api/assets/[id]/delivery/route.ts'+':GET',12000);
