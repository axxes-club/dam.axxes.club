// No customer-data queries or credential output. Active authority must be ready before release.
const fs=require('node:fs');const {parseEnv}=require('node:util');const {Client}=require('pg');
const required={
 assets:['owner_user_id','uploaded_by_id','storage_key','upload_key','expires_at','trashed_at','trash_reason','app_key'],
 upload_sessions:['owner_user_id'],asset_folders:['library_id','owner_user_id','expires_at','trashed_at'],folder_grants:['folder_id','recipient_user_id','recipient_tenant_id'],asset_app_grants:['asset_id','audience_tenant_id'],folders_upload_intents:['library_id','user_id'],asset_ownership_events:['asset_id','actor_user_id'],folder_storage_cleanup:['storage_key','next_attempt_at'],office_service_requests:['caller','request_id'],office_uploads:['library_id','storage_key'],gcp_asset_uploads:['document','result'],
 storage_accounts:['tenant_id','user_id','base_bytes','used_bytes','reserved_bytes'],storage_reservations:['upload_id','state'],storage_object_charges:['object_key','generation'],storage_asset_links:['asset_id'],storage_entitlements:['bytes'],storage_billing_events:['provider_event_id'],storage_override_audit:['old_base_bytes','new_base_bytes'],storage_legacy_usage:['tenant_id'],workspace_membership_outbox:['organization_id','user_id']
};
function findMissing(rows,service){const expected={...required,...(service==='members'?{website_drafts:['snapshot'],website_revisions:['snapshot'],website_publications:['snapshot']}:{})};const actual=new Set(rows.map(r=>r.table_name+'.'+r.column_name));return Object.entries(expected).flatMap(([table,columns])=>columns.filter(column=>!actual.has(table+'.'+column)).map(column=>table+'.'+column));}
function connectionPlan(connectionString){
 const url=new URL(connectionString);const socket=url.searchParams.get('host');
 if(!socket?.startsWith('/cloudsql/'))return {connectionString,instance:null};
 const instance=socket.slice('/cloudsql/'.length);
 if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]:[a-z0-9-]+:[a-z][a-z0-9-]*$/.test(instance))throw Object.assign(new Error(),{code:'INVALID_CLOUDSQL_INSTANCE'});
 url.hostname='127.0.0.1';url.port='15432';url.searchParams.delete('host');
 for(const name of ['sslcert','sslkey','sslrootcert'])url.searchParams.delete(name);
 url.searchParams.set('sslmode','disable');
 return {connectionString:url.toString(),instance};
}
async function startProxy(instance){
 const {spawn}=require('node:child_process');const net=require('node:net');
 const binary=process.env.CLOUD_SQL_PROXY_PATH??'/run/cloudsql-proxy';
 if(!fs.existsSync(binary))throw Object.assign(new Error(),{code:'CLOUDSQL_PROXY_BINARY_REQUIRED'});
 const child=spawn(binary,['--address=127.0.0.1','--port=15432','--quiet',instance],{stdio:'ignore'});
 let failed=false;child.on('error',()=>{failed=true;});
 const stop=()=>{if(child.exitCode===null)child.kill('SIGTERM');};
 try{for(let attempt=0;attempt<60;attempt++){
  if(failed||child.exitCode!==null)throw Object.assign(new Error(),{code:'CLOUDSQL_PROXY_START_FAILED'});
  const ready=await new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port:15432});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>{socket.destroy();resolve(false);});});
  if(ready)return stop;
  await new Promise(resolve=>setTimeout(resolve,500));
 }throw Object.assign(new Error(),{code:'CLOUDSQL_PROXY_START_TIMEOUT'});}catch(error){stop();throw error;}
}
module.exports={findMissing,connectionPlan};
async function main(){
 const service=process.argv[2];if(!['dam','members'].includes(service))throw Object.assign(new Error(),{code:'SERVICE_REQUIRED'});
 const env=parseEnv(fs.readFileSync(process.argv[3]??'/run/secrets/build-env','utf8'));
 if(!env.DATABASE_URL)throw Object.assign(new Error(),{code:'DATABASE_URL_REQUIRED'});
 const plan=connectionPlan(env.DATABASE_URL);
 const stopProxy=plan.instance?await startProxy(plan.instance):()=>{};
 const client=new Client({connectionString:plan.connectionString,connectionTimeoutMillis:15000});
 try{await client.connect();await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='15000ms'");const {rows}=await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'");const missing=findMissing(rows,service);if(missing.length){console.error('Schema readiness missing required columns: '+missing.join(', '));throw Object.assign(new Error(),{code:'SCHEMA_NOT_READY'});}await client.query('ROLLBACK');console.log('Active source schema readiness passed for '+service);}finally{await client.end().catch(()=>{});stopProxy();}
}
if(require.main===module)main().catch(error=>{console.error('Active source schema readiness failed: '+(error.code??'READINESS_CHECK_FAILED'));process.exitCode=1;});
