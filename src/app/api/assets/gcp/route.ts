import {wrapAdmission} from '@/lib/security/admission-server';
import { storageHandlers } from "@/lib/gcs/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function GETHandler(request: Request) { return storageHandlers().GET(request); }

export const GET=wrapAdmission(GETHandler,'src/app/api/assets/gcp/route.ts'+':GET',12000);
