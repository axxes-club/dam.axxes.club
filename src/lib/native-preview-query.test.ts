import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {PgDialect} from 'drizzle-orm/pg-core';
import {nativePreviewStatement} from './native-preview-query';
test('native preview query joins UUID links and remains scoped to the authorized asset tenant',async()=>{
 const pg=new PGlite();const asset='00000000-0000-0000-0000-000000000001',doc='00000000-0000-0000-0000-000000000002',tenant='00000000-0000-0000-0000-000000000003';
 try{await pg.exec(`create table office_documents(id uuid,tenant_id uuid,kind text,content jsonb,deleted_at timestamptz);create table asset_app_links(asset_id uuid,record_id uuid,app_key text);insert into office_documents values('${doc}','${tenant}','doc','{"blocks":[]}',null);insert into asset_app_links values('${asset}','${doc}','office');`);
 const execute=async(tenantId:string)=>{const query=new PgDialect().sqlToQuery(nativePreviewStatement({id:asset,tenantId}));return pg.query(query.sql,query.params);};
 assert.equal((await execute(tenant)).rows.length,1);assert.equal((await execute('00000000-0000-0000-0000-000000000004')).rows.length,0);
 await pg.exec('update office_documents set deleted_at=now()');assert.equal((await execute(tenant)).rows.length,0);
 }finally{await pg.close();}
});
