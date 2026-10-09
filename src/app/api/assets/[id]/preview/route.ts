import {wrapAdmission} from '@/lib/security/admission-server';
import {getViewer} from "@/lib/access";
import {authorizeAsset} from "@/lib/library";
import {previewAsset} from "@/lib/asset-preview";
export const dynamic="force-dynamic";
export const runtime="nodejs";
async function GETHandler(req:Request,{params}:{params: Promise<{id:string}>}){
 const viewer=await getViewer(req.headers);
 if(!viewer)return new Response(null,{status:401});
 let asset;try{asset=await authorizeAsset(viewer,(await params).id);}catch{return new Response(null,{status:404});}
 return previewAsset(asset,req);
}

export const GET=wrapAdmission(GETHandler,'src/app/api/assets/[id]/preview/route.ts'+':GET',12000);
