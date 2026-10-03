import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {ourFileRouter} from '../app/api/uploadthing/core';
for(const route of ['assetUploader','handoffUploader'] as const)test(`${route} completion uses its held connection and retains lifecycle authorization`,async()=>{
 const pg=new PGlite();
 await pg.exec(`create table "user"(id text primary key,name text,email text,email_verified boolean default true,image text,is_superadmin boolean default false,created_at timestamptz default now(),updated_at timestamptz default now());
 create table upload_sessions(id uuid primary key,token text,tenant_id uuid,owner_user_id text,folder text,created_by_id text,photos jsonb default '[]',expires_at timestamptz,created_at timestamptz default now());
 insert into upload_sessions(id,token,owner_user_id,folder,created_by_id,expires_at) values('00000000-0000-4000-8000-000000000001','fixture','transaction-only','Uploads','transaction-only',now()+interval '10 minutes');
 create table tenants(id uuid,status text,name text,slug text,settings jsonb,deleted_at timestamptz);
 create table tenant_memberships(tenant_id uuid,user_id text,role text,deleted_at timestamptz);
 create table asset_folders(id uuid,library_id text,tenant_id uuid,owner_user_id text,path text,expires_at timestamptz,trashed_at timestamptz,trash_reason text);
 insert into "user"(id,name,email) values('transaction-only','Fixture','fixture@example.invalid');
 create table assets(id uuid primary key default gen_random_uuid(),tenant_id uuid,owner_user_id text,uploaded_by_id text,name text,url text,mime_type text,file_size bigint,folder text,category text,source text,tags jsonb,storage_key text,upload_key text unique,app_key text,expires_at timestamptz,trashed_at timestamptz,trash_reason text,description text,thumbnail_url text,width integer,height integer,original_filename text,alt_text text,created_at timestamptz default now(),updated_at timestamptz default now());
 `);
 let queries=0;
 const transaction={query:async(config:{text:string;rowMode?:string}|string,args:unknown[])=>{queries++;const result=await pg.query(typeof config==='string'?config:config.text,args);return typeof config!=='string'&&config.rowMode==='array'?{...result,rows:result.rows.map(row=>Object.values(row as object))}:result}};
 try{
 const data=await (ourFileRouter[route] as unknown as {completeHook:(payload:unknown)=>Promise<unknown>}).completeHook({metadata:{tenantId:'personal',userId:'transaction-only',folder:'Uploads',tokenId:'00000000-0000-4000-8000-000000000001'},file:{key:'uploads/dam/test',name:'a.txt',size:1,type:'text/plain',url:'https://dam.axxes.club/file',ufsUrl:'https://dam.axxes.club/file',generation:'1'},uploadId:'test',transaction} as never);
 assert.ok((data as {assetId:string}).assetId);assert.ok(queries>=4);
 assert.equal((await pg.query<{owner_user_id:string}>('select owner_user_id from assets')).rows[0].owner_user_id,'transaction-only');
 await pg.exec("insert into asset_folders(id,library_id,owner_user_id,path,trashed_at) values(gen_random_uuid(),'user:transaction-only','transaction-only','Uploads',now())");
 await assert.rejects((ourFileRouter[route] as unknown as {completeHook:(payload:unknown)=>Promise<unknown>}).completeHook({metadata:{tenantId:'personal',userId:'transaction-only',folder:'Uploads',tokenId:'00000000-0000-4000-8000-000000000001'},file:{key:'uploads/dam/blocked',name:'b.txt',size:1,type:'text/plain',ufsUrl:'https://dam.axxes.club/file'},transaction}),/Folder unavailable/);
 assert.equal((await pg.query('select id from assets')).rows.length,1);
 if(route==='handoffUploader'){
  const {rows:[handoff]}=await pg.query<{photos:string[]}>('select photos from upload_sessions');assert.deepEqual(handoff.photos,[`/api/assets/${(data as {assetId:string}).assetId}/delivery`]);
  await pg.exec("update upload_sessions set expires_at=now()-interval '1 minute'");
  await assert.rejects((ourFileRouter[route] as unknown as {completeHook:(payload:unknown)=>Promise<unknown>}).completeHook({metadata:{tenantId:'personal',userId:'transaction-only',folder:'Uploads',tokenId:'00000000-0000-4000-8000-000000000001'},file:{key:'uploads/dam/expired',name:'c.jpg',size:1,type:'image/jpeg',ufsUrl:'https://dam.axxes.club/file'},transaction}),/Session expired/);
  assert.equal((await pg.query('select id from assets')).rows.length,1);
 }

 }finally{await pg.close()}
});
