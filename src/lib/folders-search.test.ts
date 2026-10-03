import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {pgTable,text} from 'drizzle-orm/pg-core';
import {folderFilter} from './folders-search';
const files=pgTable('files',{folder:text('folder')});
test('recursive search includes nested grants but excludes sibling prefixes; browse stays exact',async()=>{
 const pg=new PGlite(); await pg.exec("create table files(folder text); insert into files values ('Projects'),('Projects/Client'),('Projects2'),('Other')");
 const db=drizzle(pg);
 assert.deepEqual((await db.select().from(files).where(folderFilter(files.folder,'Projects',true))).map(r=>r.folder),['Projects','Projects/Client']);
 assert.deepEqual((await db.select().from(files).where(folderFilter(files.folder,'Projects',false))).map(r=>r.folder),['Projects']);
 await pg.close();
});
