import {QuotaError} from './quota.mjs';
export function validateKey(key) {
 if(!key||typeof key.tenantId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key.tenantId)||typeof key.userId!=='string'||!key.userId||key.userId.length>512)throw new QuotaError('Organization and user are required');
 return key;
}
async function currentMember(client,key){
 validateKey(key);
 const {rows:[row]}=await client.query(`SELECT u.is_superadmin,m.role FROM tenants t JOIN "user" u ON u.id=$2
 LEFT JOIN tenant_memberships m ON m.tenant_id=t.id AND m.user_id=u.id AND m.deleted_at IS NULL
 WHERE t.id=$1 AND t.deleted_at IS NULL AND t.status='active'
 AND COALESCE(t.settings->'features'->>'folders','true')<>'false'
 AND (m.user_id IS NOT NULL OR u.is_superadmin=true)`,[key.tenantId,key.userId]);
 if(!row)throw new QuotaError('No active organization membership',403,'storage_access_denied');return row;
}
export async function assertChargingUser(client,key){
 const row=await currentMember(client,key);
 if(!row.is_superadmin&&!['owner','admin','manager','member'].includes(row.role))throw new QuotaError('Uploading is not allowed',403,'storage_access_denied');
}
export async function authorizeQuota(client,actor,key,write=false){
 await currentMember(client,key);
 if(!actor||!['member','platform','webmaster'].includes(actor.kind)||typeof actor.id!=='string'||!actor.id||actor.id.length>512)throw new QuotaError('Unauthorized',403);
 // Only the separately verified internal service handler constructs webmaster actors.
 if(actor.kind==='webmaster')return actor;
 const row=await currentMember(client,{tenantId:key.tenantId,userId:actor.id});
 if(!row.is_superadmin&&!['owner','admin'].includes(row.role)&&(write||actor.id!==key.userId))throw new QuotaError('Storage administration is not allowed',403,'storage_access_denied');
 return {kind:row.is_superadmin?'platform':'member',id:actor.id};
}

export async function chargingUserForHandoff(client,session){
 const key={tenantId:session.tenantId,userId:session.createdById};await assertChargingUser(client,key);return key.userId;
}
