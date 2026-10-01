export const DEFAULT_BASE_BYTES=5000000000n;
export class QuotaError extends Error {
 constructor(message,status=400,code="invalid_storage_input",details={}) {super(message);this.status=status;this.code=code;this.details=details;}
}
export function parseBytes(value) {
 if(typeof value!=="string"||!/^(0|[1-9][0-9]*)$/.test(value)||value.length>19)throw new QuotaError("Bytes must be a nonnegative decimal string");
 const bytes=BigInt(value);
 if(bytes>9223372036854775807n)throw new QuotaError("Byte value is too large");
 return bytes;
}
export async function ensureAccount(client,key) {
 await client.query("INSERT INTO storage_accounts(tenant_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[key.tenantId,key.userId]);
}
export async function readStorage(client,key,now=new Date()) {
 await ensureAccount(client,key);
 const {rows:[row]}=await client.query(`SELECT a.base_bytes::text,a.used_bytes::text,a.reserved_bytes::text,
 COALESCE((SELECT sum(e.bytes) FROM storage_entitlements e WHERE e.tenant_id=a.tenant_id AND e.user_id=a.user_id AND e.status='active' AND e.starts_at<=$3 AND e.ends_at>$3),0)::text AS paid_bytes,
 COALESCE((SELECT sum(c.bytes) FROM storage_legacy_usage c WHERE c.tenant_id=a.tenant_id),0)::text AS legacy_bytes
 FROM storage_accounts a WHERE a.tenant_id=$1 AND a.user_id=$2`,[key.tenantId,key.userId,now]);
 const effective=BigInt(row.base_bytes)+BigInt(row.paid_bytes),remaining=effective-BigInt(row.used_bytes)-BigInt(row.reserved_bytes);
 return {baseBytes:row.base_bytes,paidBytes:row.paid_bytes,usedBytes:row.used_bytes,reservedBytes:row.reserved_bytes,effectiveBytes:effective.toString(),remainingBytes:(remaining>0n?remaining:0n).toString(),legacyBytes:row.legacy_bytes};
}
export async function lockAccount(client,key) {
 await ensureAccount(client,key);
 await client.query('SELECT 1 FROM storage_accounts WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE',[key.tenantId,key.userId]);
}
export async function reserveBatch(client,{key,records,enforce,now=new Date()}) {
 if(!['shadow','enforce'].includes(enforce))throw new QuotaError('Invalid quota mode');
 const requested=records.reduce((sum,r)=>sum+parseBytes(String(r.descriptor.size)),0n);
 if(requested<=0n||records.some(r=>r.descriptor.size<=0||r.maxExpiresAt<=now.getTime()))throw new QuotaError('Invalid reservation');
 await lockAccount(client,key);
 const snapshot=await readStorage(client,key,now);
 if(enforce==='enforce'&&BigInt(snapshot.usedBytes)+BigInt(snapshot.reservedBytes)+requested>BigInt(snapshot.effectiveBytes))throw new QuotaError('Storage limit reached',409,'storage_limit_exceeded',{...snapshot,requestedBytes:requested.toString()});
 parseBytes((BigInt(snapshot.reservedBytes)+requested).toString());
 for(const record of records) {
  await client.query('INSERT INTO storage_reservations(upload_id,tenant_id,user_id,bytes,expires_at,enforcement) VALUES($1,$2,$3,$4,$5,$6)',[record.id,key.tenantId,key.userId,String(record.descriptor.size),new Date(record.maxExpiresAt),enforce]);
  record.quota={...key};
 }
 await client.query('UPDATE storage_accounts SET reserved_bytes=reserved_bytes+$3,updated_at=now() WHERE tenant_id=$1 AND user_id=$2',[key.tenantId,key.userId,requested.toString()]);
}
export async function expireReservations(client,now=new Date()) {
 const {rows:keys}=await client.query("SELECT DISTINCT tenant_id,user_id FROM storage_reservations WHERE state='pending' AND expires_at<=$1 ORDER BY tenant_id,user_id",[now]);
 let total=0;
 for(const row of keys) {
  const key={tenantId:row.tenant_id,userId:row.user_id};await lockAccount(client,key);
  const {rows}=await client.query("UPDATE storage_reservations SET state='expired' WHERE tenant_id=$1 AND user_id=$2 AND state='pending' AND expires_at<=$3 RETURNING bytes::text",[key.tenantId,key.userId,now]);
  const bytes=rows.reduce((sum,r)=>sum+BigInt(r.bytes),0n);
  await client.query('UPDATE storage_accounts SET reserved_bytes=reserved_bytes-$3,updated_at=now() WHERE tenant_id=$1 AND user_id=$2',[key.tenantId,key.userId,bytes.toString()]);total+=rows.length;
 }
 return total;
}
export async function cancelReservations(client,{key,uploadIds}) {
 await lockAccount(client,key);
 const {rows}=await client.query("UPDATE storage_reservations SET state='cancelled' WHERE tenant_id=$1 AND user_id=$2 AND upload_id=ANY($3::uuid[]) AND state='pending' RETURNING bytes::text",[key.tenantId,key.userId,uploadIds]);
 const bytes=rows.reduce((sum,r)=>sum+BigInt(r.bytes),0n);
 await client.query('UPDATE storage_accounts SET reserved_bytes=reserved_bytes-$3,updated_at=now() WHERE tenant_id=$1 AND user_id=$2',[key.tenantId,key.userId,bytes.toString()]);return rows.length;
}
export async function commitCharge(client,{uploadId,assetId,objectKey,generation,actualBytes,now=new Date()}) {
 const {rows:[initial]}=await client.query('SELECT tenant_id,user_id FROM storage_reservations WHERE upload_id=$1',[uploadId]);
 if(!initial)throw new QuotaError('Upload has no reservation',409);
 const key={tenantId:initial.tenant_id,userId:initial.user_id};await lockAccount(client,key);
 const {rows:[r]}=await client.query('SELECT *,bytes::text FROM storage_reservations WHERE upload_id=$1 FOR UPDATE',[uploadId]);
 if(r.state==='complete')return;
 if(r.state!=='pending'||new Date(r.expires_at)<=now)throw new QuotaError('Upload reservation is closed',410);
 if(parseBytes(actualBytes)!==BigInt(r.bytes))throw new QuotaError('Actual upload size differs from reservation',409);
 await client.query('INSERT INTO storage_object_charges(object_key,generation,tenant_id,user_id,bytes) VALUES($1,$2,$3,$4,$5)',[objectKey,generation,key.tenantId,key.userId,actualBytes]);
 await client.query('INSERT INTO storage_asset_links(asset_id,object_key,generation) VALUES($1,$2,$3)',[assetId,objectKey,generation]);
 await client.query("UPDATE storage_reservations SET state='complete' WHERE upload_id=$1",[uploadId]);
 await client.query('UPDATE storage_accounts SET reserved_bytes=reserved_bytes-$3,used_bytes=used_bytes+$3,updated_at=now() WHERE tenant_id=$1 AND user_id=$2',[key.tenantId,key.userId,actualBytes]);
}
export async function lockedCharge(client,{objectKey,generation}) {
 const {rows:[initial]}=await client.query('SELECT * FROM storage_object_charges WHERE object_key=$1 AND generation=$2',[objectKey,generation]);
 if(!initial)return null;
 if(initial.user_id)await lockAccount(client,{tenantId:initial.tenant_id,userId:initial.user_id});
 const {rows:[row]}=await client.query('SELECT *,bytes::text FROM storage_object_charges WHERE object_key=$1 AND generation=$2 FOR UPDATE',[objectKey,generation]);return row;
}
export async function objectRetained(client,{objectKey,generation}) {
 const {rows:[r]}=await client.query('SELECT EXISTS(SELECT 1 FROM storage_asset_links l JOIN assets a ON a.id=l.asset_id WHERE l.object_key=$1 AND l.generation=$2) AS retained',[objectKey,generation]);return r.retained;
}
export async function releaseObjectCharge(client,input) {
 const row=await lockedCharge(client,input);
 if(!row||row.released_at||await objectRetained(client,input))return false;
 await client.query('DELETE FROM storage_asset_links WHERE object_key=$1 AND generation=$2',[input.objectKey,input.generation]);
 await client.query('UPDATE storage_object_charges SET released_at=now() WHERE object_key=$1 AND generation=$2',[input.objectKey,input.generation]);
 if(row.user_id)await client.query('UPDATE storage_accounts SET used_bytes=used_bytes-$3,updated_at=now() WHERE tenant_id=$1 AND user_id=$2',[row.tenant_id,row.user_id,row.bytes]);return true;
}
export async function deleteChargedObject(pool,input,remove) {
 const client=await pool.connect();
 try{await client.query('BEGIN');const charge=await lockedCharge(client,input);
  if(!charge||charge.released_at||await objectRetained(client,input)){await client.query('COMMIT');return false;}
  await remove();const released=await releaseObjectCharge(client,input);await client.query('COMMIT');return released;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function setBaseAllowance(pool,{actor,key,baseBytes,reason}) {
 const bytes=parseBytes(baseBytes);
 if(typeof reason!=='string'||!reason.trim()||reason.trim().length>1000)throw new QuotaError('A reason between 1 and 1000 characters is required');
 const {authorizeQuota}=await import('./authorization.mjs');const{randomUUID}=await import('node:crypto');
 const client=await pool.connect();
 try{await client.query('BEGIN');const authorized=await authorizeQuota(client,actor,key,true);await lockAccount(client,key);const old=await readStorage(client,key);
 await client.query('UPDATE storage_accounts SET base_bytes=$3,updated_at=now() WHERE tenant_id=$1 AND user_id=$2',[key.tenantId,key.userId,bytes.toString()]);
 await client.query('INSERT INTO storage_override_audit(id,tenant_id,user_id,actor_kind,actor_id,old_base_bytes,new_base_bytes,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),key.tenantId,key.userId,authorized.kind,authorized.id,old.baseBytes,bytes.toString(),reason.trim()]);
 const snapshot=await readStorage(client,key);await client.query('COMMIT');return snapshot;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
