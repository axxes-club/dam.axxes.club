import{storageHandlers,storageEnabled}from "@/lib/gcs/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){return Response.json({enabled:storageEnabled()},{headers:{"Cache-Control":"no-store"}});}
export async function POST(request:Request){if(!storageEnabled())return Response.json({error:"GCS storage is disabled"},{status:503});return storageHandlers().POST(request);}
