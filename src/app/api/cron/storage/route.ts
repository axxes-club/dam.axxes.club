import {cleanupUnreferencedStorage} from "@/lib/gcs/server";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return Response.json({error:"Unauthorized"},{status:401});
 try{return Response.json({removed:await cleanupUnreferencedStorage()},{headers:{"Cache-Control":"no-store"}});}catch{return Response.json({error:"Storage cleanup failed"},{status:500});}
}
