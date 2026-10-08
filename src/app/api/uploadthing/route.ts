import {wrapAdmission} from '@/lib/security/admission-server';
import { legacyCallbackRequest } from "@/lib/gcs/legacy-callback.mjs";
import type { NextRequest } from "next/server";
import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "@/lib/gcs/legacy-router";
import { storageHandlers, storageEnabled } from "@/lib/gcs/server";
const legacy = createRouteHandler({ router: ourFileRouter });
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function GETHandler(request: NextRequest) {
  return storageEnabled()
    ? Response.json({ error: "Legacy provider disabled" }, { status: 410 })
    : legacy.GET(request);
}
async function POSTHandler(request: NextRequest) {
  return !storageEnabled() || legacyCallbackRequest(request)
    ? legacy.POST(request)
    : storageHandlers().POST(request);
}

export const GET=wrapAdmission(GETHandler,'src/app/api/uploadthing/route.ts'+':GET',12000);

export const POST=wrapAdmission(POSTHandler,'src/app/api/uploadthing/route.ts'+':POST',3000);
