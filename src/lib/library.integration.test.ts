import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import { assets, assetFolders, folderGrants } from "./db/schema";
import { authorizeAsset, assertLibraryAccess } from "./library";
import type { db as productionDb } from "./db";
import type { Viewer } from "./types";

const ownedId = "11111111-1111-4111-8111-111111111111";
const privateId = "22222222-2222-4222-8222-222222222222";
function viewer(id: string): Viewer { return { id, name: id, email: `${id}@test.invalid`, image: null, isSuperadmin: false, tenants: [] }; }
async function fixture() {
  const pg = new PGlite();
  for (const table of [assets, assetFolders, folderGrants]) {
    const config = getTableConfig(table);
    await pg.exec(`create table "${config.name}"(${config.columns.map(c => `"${c.name}" ${c.getSQLType()}`).join(",")})`);
  }
  await pg.exec(`insert into assets(id,owner_user_id,folder) values('${ownedId}','owner','/Apps/Nexus'),('${privateId}','owner','/Private');
    insert into asset_folders(id,library_id,owner_user_id,path) values('33333333-3333-4333-8333-333333333333','user:owner','owner','/Apps/Nexus');
    insert into folder_grants(folder_id,recipient_user_id,can_read,can_upload) values('33333333-3333-4333-8333-333333333333','reader',true,false);`);
  return { pg, db: drizzle(pg) as unknown as typeof productionDb };
}
test("shared readers see only granted personal folders and cannot manage ownership", async () => {
  const { pg, db } = await fixture();
  try {
    assert.equal((await authorizeAsset(viewer("owner"), ownedId, "read", db)).id, ownedId);
    assert.equal((await authorizeAsset(viewer("reader"), ownedId, "read", db)).id, ownedId);
    await assert.rejects(authorizeAsset(viewer("stranger"), ownedId, "read", db), /Forbidden/);
    await assert.rejects(authorizeAsset(viewer("reader"), privateId, "read", db), /Forbidden/);
    await assert.rejects(authorizeAsset(viewer("reader"), ownedId, "write", db), /Only owners/);
    await assert.rejects(assertLibraryAccess(viewer("reader"), "user:owner", "write", "/Apps/Nexus", db), /Forbidden/);
  } finally { await pg.close(); }
});
test("expired grants and ancestor folders block access before the cron sweep", async () => {
  const { pg, db } = await fixture();
  try {
    await pg.exec("update folder_grants set expires_at=now()-interval '1 minute'");
    await assert.rejects(authorizeAsset(viewer("reader"), ownedId, "read", db), /Forbidden/);
    await pg.exec("update folder_grants set expires_at=null; insert into asset_folders(library_id,owner_user_id,path,expires_at) values('user:owner','owner','/Apps',now()-interval '1 minute')");
    await assert.rejects(authorizeAsset(viewer("reader"), ownedId, "read", db), /Forbidden/);
    await assert.rejects(authorizeAsset(viewer("owner"), ownedId, "read", db), /Forbidden/);
    await pg.exec("update asset_folders set expires_at=null; update assets set trashed_at=now() where folder='/Apps/Nexus'");
    await assert.rejects(authorizeAsset(viewer("owner"), ownedId, "read", db), /Forbidden/);
  } finally { await pg.close(); }
});
