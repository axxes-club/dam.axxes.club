import {organizationId} from '@/lib/organization-id';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getViewer,tenantAccess } from '@/lib/access';
export async function GET(request:Request){
 const tenant=new URL(request.url).searchParams.get('tenant')||'';
 if(tenant==='personal'||tenant.startsWith('user:'))return Response.json({siteId:null},{headers:{'Cache-Control':'no-store'}});
 if(!organizationId(tenant))return Response.json({error:'Invalid organization'},{status:400});
 const viewer=await getViewer(request.headers);if(!viewer||!tenantAccess(viewer,tenant))return Response.json({error:'App unavailable'},{status:404});
 try{const result=await db.execute(sql`select public_id,identity_mode,allowed_origins from pulse_sites where tenant_id=${tenant} and integration_key='folders' and environment='production' and enabled=true and exists(select 1 from tenant_memberships m join tenants t on t.id=m.tenant_id where m.tenant_id=${tenant} and m.user_id=${viewer.id} and m.deleted_at is null and t.deleted_at is null and t.status='active') order by created_at desc`);const rows=(Array.isArray(result)?result:(result as unknown as {rows:Array<{public_id:string;identity_mode:string;allowed_origins:string[]}>}).rows) as Array<{public_id:string;identity_mode:string;allowed_origins:string[]}>;const origin='https://'+(request.headers.get('x-forwarded-host')||request.headers.get('host'));const site=rows.find(r=>r.allowed_origins.includes(origin));return Response.json(site?{siteId:site.public_id,identityMode:site.identity_mode}:{siteId:null},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({siteId:null},{headers:{'Cache-Control':'no-store'}})}
}
