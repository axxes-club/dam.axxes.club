import {wrapAdmission} from '@/lib/security/admission-server';
import{storageHandlers,storageEnabled}from "@/lib/gcs/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function GETHandler(){return Response.json({enabled:storageEnabled()},{headers:{"Cache-Control":"no-store"}});}
async function POSTHandler(request:Request){if(!storageEnabled())return Response.json({error:"GCS storage is disabled"},{status:503});return storageHandlers().POST(request);}

export const GET=wrapAdmission(GETHandler,'src/app/api/storage/route.ts'+':GET',12000);

export const POST=wrapAdmission(POSTHandler,'src/app/api/storage/route.ts'+':POST',3000);
