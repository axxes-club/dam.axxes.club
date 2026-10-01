import type {NextRequest} from "next/server";
import {createRouteHandler}from "uploadthing/next";
import {ourFileRouter}from "@/lib/gcs/legacy-router";
import {storageHandlers,storageEnabled}from "@/lib/gcs/server";
const legacy=createRouteHandler({router:ourFileRouter});
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){return storageEnabled()?Response.json({error:"Legacy provider disabled"},{status:410}):legacy.GET(request);}
export async function POST(request:NextRequest){return storageEnabled()?storageHandlers().POST(request):legacy.POST(request);}
