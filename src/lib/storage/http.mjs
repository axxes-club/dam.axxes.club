import{QuotaError,readStorage,setBaseAllowance}from'./quota.mjs';import{authorizeQuota,validateKey}from'./authorization.mjs';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'};
export function storageRoutes({pool,getActor,origins,verifyService}){
 const wrap=fn=>async request=>{try{return Response.json(await fn(request),{headers});}catch(error){return Response.json({error:error instanceof QuotaError?error.message:'Storage request failed',code:error instanceof QuotaError?error.code:'storage_request_failed'},{status:error instanceof QuotaError?error.status:500,headers});}};
 const actor=async request=>{const a=await getActor(request);if(!a)throw new QuotaError('Sign in to view storage',401,'unauthorized');return a;};
 const body=async(request,internal=false)=>{
  if(!internal&&!origins.includes(request.headers.get('origin')))throw new QuotaError('Request origin denied',403);
  const reader=request.body?.getReader();if(!reader)throw new QuotaError('JSON body required');let text='',size=0;const decoder=new TextDecoder();
  while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw new QuotaError('Request too large',413);}text+=decoder.decode(value,{stream:true});}
  let value;try{value=JSON.parse(text+decoder.decode());}catch{throw new QuotaError('Invalid JSON');}
  const allowed=['tenantId','userId','baseBytes','reason',...(internal?['webmasterActorId']:[])];
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!allowed.includes(k)))throw new QuotaError('Invalid storage fields');
  return value;
 };
 const members=async(a,url)=>{
  const tenantId=url.searchParams.get('tenantId');const candidate=validateKey({tenantId,userId:a.id});
  if(a.kind!=='webmaster')await authorizeQuota(pool,a,candidate,true);
  const offsetText=url.searchParams.get('cursor')??'0';if(!/^[0-9]{1,6}$/.test(offsetText))throw new QuotaError('Invalid cursor');const offset=Number(offsetText);
  const{rows}=await pool.query(`SELECT u.id AS user_id,u.name,m.role FROM tenant_memberships m JOIN "user" u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=$1 AND m.deleted_at IS NULL AND t.deleted_at IS NULL AND t.status='active' ORDER BY u.id LIMIT 51 OFFSET $2`,[tenantId,offset]);
  const users=await Promise.all(rows.slice(0,50).map(async row=>({userId:row.user_id,name:row.name,role:row.role,...await readStorage(pool,{tenantId,userId:row.user_id})})));
  return {members:users,nextCursor:rows.length>50?String(offset+50):null};
 };
 return {
 GET:wrap(async request=>{const a=await actor(request),url=new URL(request.url),key=validateKey({tenantId:url.searchParams.get('tenantId'),userId:url.searchParams.get('userId')??a.id});await authorizeQuota(pool,a,key);const snapshot=await readStorage(pool,key);
  let canAdminister=false;try{await authorizeQuota(pool,a,key,true);canAdminister=true;}catch{}
  const audit=canAdminister?(await pool.query('SELECT actor_kind,actor_id,old_base_bytes::text,new_base_bytes::text,reason,created_at FROM storage_override_audit WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 20',[key.tenantId,key.userId])).rows:[];
  return {...snapshot,canAdminister,audit,purchasesAvailable:false};}),
 PATCH:wrap(async request=>{const a=await actor(request),value=await body(request);return setBaseAllowance(pool,{actor:a,key:validateKey(value),baseBytes:value.baseBytes,reason:value.reason});}),
 MEMBERS:wrap(async request=>members(await actor(request),new URL(request.url))),
 INTERNAL:wrap(async request=>{
  if(!verifyService)throw new QuotaError('Service access denied',403);
  try{await verifyService(request);}catch{throw new QuotaError('Service access denied',403);}
  if(request.method==='GET'){
   const url=new URL(request.url),a={kind:'webmaster',id:'authenticated-webmaster'};
   if(url.searchParams.get('tenantId'))return members(a,url);
   const{rows}=await pool.query("SELECT id,name FROM tenants WHERE deleted_at IS NULL AND status='active' AND COALESCE(settings->'features'->>'folders','true')<>'false' ORDER BY name LIMIT 500");return{organizations:rows};
  }
  const value=await body(request,true);if(typeof value.webmasterActorId!=='string'||!value.webmasterActorId||value.webmasterActorId.length>512)throw new QuotaError('Webmaster actor required');
  return setBaseAllowance(pool,{actor:{kind:'webmaster',id:value.webmasterActorId},key:validateKey(value),baseBytes:value.baseBytes,reason:value.reason});
 })
 };
}
