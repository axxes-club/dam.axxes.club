import { deliverAsset } from "@/lib/delivery";
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/access";
import { authorizeAsset } from "@/lib/library";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const viewer = await getViewer(req.headers);
  if (!viewer) return new NextResponse(null, { status: 401 });
  let row;
  try {
    row = await authorizeAsset(viewer, params.id);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  return deliverAsset(row);
}
