import { NextResponse } from "next/server";
import { getViewer } from "@/lib/access";
import { sharedFolderDestinations } from "@/lib/library";
export async function GET(req: Request) {
  const viewer = await getViewer(req.headers);
  if (!viewer) return NextResponse.json({ error: "Sign in to view your libraries" }, { status: 401 });
  const shared = await sharedFolderDestinations(viewer);
  return NextResponse.json({ libraries: [...viewer.tenants, ...shared.filter(s => s.canRead).map(s => ({
    id: s.libraryId, folder: s.folder, name: `Shared: ${s.folder}`, role: "shared", canWrite: s.canWrite, canDelete: false,
  }))] }, { headers: { "Cache-Control": "private, no-store" } });
}
