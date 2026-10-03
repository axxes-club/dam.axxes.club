import {getViewer} from "@/lib/access";
import {authorizeAsset} from "@/lib/library";
import {previewAsset} from "@/lib/asset-preview";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(req:Request,{params}:{params:{id:string}}){
 const viewer=await getViewer(req.headers);
 if(!viewer)return new Response(null,{status:401});
 let asset;try{asset=await authorizeAsset(viewer,params.id);}catch{return new Response(null,{status:404});}
 return previewAsset(asset,req);
}
