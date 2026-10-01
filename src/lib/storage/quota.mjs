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
 COALESCE((SELECT sum(c.bytes) FROM storage_object_charges c WHERE c.tenant_id=a.tenant_id AND c.user_id IS NULL AND c.released_at IS NULL),0)::text AS legacy_bytes
 FROM storage_accounts a WHERE a.tenant_id=$1 AND a.user_id=$2`,[key.tenantId,key.userId,now]);
 const effective=BigInt(row.base_bytes)+BigInt(row.paid_bytes),remaining=effective-BigInt(row.used_bytes)-BigInt(row.reserved_bytes);
 return {baseBytes:row.base_bytes,paidBytes:row.paid_bytes,usedBytes:row.used_bytes,reservedBytes:row.reserved_bytes,effectiveBytes:effective.toString(),remainingBytes:(remaining>0n?remaining:0n).toString(),legacyBytes:row.legacy_bytes};
}
