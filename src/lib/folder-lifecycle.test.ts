import { test } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  renameFolderStatement,
  restoreFolderStatement,
} from "./folder-lifecycle";
import { PGlite } from "@electric-sql/pglite";
const dialect = new PgDialect();
async function fixture() {
  const db = new PGlite();
  await db.exec(
    `create table asset_folders(id text primary key,tenant_id text,owner_user_id text,path text not null,expires_at timestamptz,trashed_at timestamptz,trash_reason text, unique(tenant_id,path)); create table assets(id text primary key,tenant_id text,owner_user_id text,folder text,expires_at timestamptz,trashed_at timestamptz,trash_reason text,updated_at timestamptz); create table office_documents(id text primary key,tenant_id text,folder text,deleted_at timestamptz,version integer default 1,updated_at timestamptz); create table asset_app_links(asset_id text,record_id text,tenant_id text,app_key text);insert into office_documents(id,tenant_id,folder)values('doc','t','From/Child');insert into asset_app_links values('file','doc','t','office');insert into asset_folders(id,tenant_id,path) values('root','t','From'),('child','t','From/Child'),('target','t','To');insert into assets(id,tenant_id,folder)values('file','t','From/Child');`,
  );
  return db;
}
async function execute(db: PGlite, statement: import("drizzle-orm").SQL) {
  const q = dialect.sqlToQuery(statement);
  return db.query<{ id: string }>(q.sql, q.params);
}
test("colliding rename leaves folders, policies and file paths untouched", async () => {
  const db = await fixture();
  const result = await execute(
    db,
    renameFolderStatement("t", null, "From", "To"),
  );
  assert.equal(result.rows.length, 0);
  assert.equal(
    (
      await db.query<{ folder: string }>(
        "select folder from assets where id='file'",
      )
    ).rows[0].folder,
    "From/Child",
  );
  assert.equal(
    (
      await db.query<{ path: string }>(
        "select path from asset_folders where id='child'",
      )
    ).rows[0].path,
    "From/Child",
  );
  await db.close();
});
test("successful rename moves root, descendants and assets in one statement", async () => {
  const db = await fixture();
  await db.exec("delete from asset_folders where id='target'");
  await execute(db, renameFolderStatement("t", null, "From", "To"));
  assert.deepEqual(
    (
      await db.query<{ path: string }>(
        "select path from asset_folders order by id",
      )
    ).rows.map((r) => r.path),
    ["To/Child", "To"],
  );
  assert.equal(
    (await db.query<{ folder: string }>("select folder from assets")).rows[0]
      .folder,
    "To/Child",
  );
  assert.equal((await db.query<{folder:string}>("select folder from office_documents where id='doc'")).rows[0].folder,'To/Child');
  await db.close();
});
test("restore clears applicable subtree trash and preserves individual deletions", async () => {
  const db = await fixture();
  await db.exec(
    `update asset_folders set trashed_at='2026-01-01',trash_reason=case when id='root' then 'deleted' else 'folder-deleted' end where id!='target';update assets set trashed_at='2026-01-01',trash_reason='folder-deleted';insert into assets(id,tenant_id,folder,trashed_at,trash_reason)values('individual','t','From','2025-12-01','deleted');`,
  );
  await execute(
    db,
    restoreFolderStatement("t", null, "From", null, new Date("2026-01-02")),
  );
  assert.equal(
    (
      await db.query<{ trashed_at: string | null }>(
        "select trashed_at from assets where id='file'",
      )
    ).rows[0].trashed_at,
    null,
  );
  assert.notEqual(
    (
      await db.query<{ trashed_at: string | null }>(
        "select trashed_at from assets where id='individual'",
      )
    ).rows[0].trashed_at,
    null,
  );
  assert.equal(
    (
      await db.query<{ trashed_at: string | null }>(
        "select trashed_at from asset_folders where id='child'",
      )
    ).rows[0].trashed_at,
    null,
  );
  await db.close();
});
test("restore fails under a trashed or expired ancestor without changing files", async () => {
  const db = await fixture();
  await db.exec(
    `insert into asset_folders(id,tenant_id,path,expires_at)values('parent','t','P','2025-01-01');update asset_folders set path='P/From',trashed_at='2026-01-01',trash_reason='deleted' where id='root';update assets set folder='P/From',trashed_at='2026-01-01',trash_reason='folder-deleted';`,
  );
  const result = await execute(
    db,
    restoreFolderStatement("t", null, "P/From", null, new Date("2026-01-02")),
  );
  assert.equal(result.rows.length, 0);
  assert.notEqual(
    (
      await db.query<{ trashed_at: string | null }>(
        "select trashed_at from assets where id='file'",
      )
    ).rows[0].trashed_at,
    null,
  );
  await db.close();
});
test("descendant destination collision preserves both folder policies", async () => {
  const db = await fixture();
  await db.exec(
    "update asset_folders set path='To/Child',expires_at='2030-01-01' where id='target';update asset_folders set expires_at='2029-01-01' where id='child'",
  );
  const result = await execute(
    db,
    renameFolderStatement("t", null, "From", "To"),
  );
  assert.equal(result.rows.length, 0);
  assert.equal(
    (
      await db.query<{ path: string; deadline: string }>(
        "select path,expires_at::text as deadline from asset_folders where id='child'",
      )
    ).rows[0].path,
    "From/Child",
  );
  assert.match(
    (
      await db.query<{ deadline: string }>(
        "select expires_at::text as deadline from asset_folders where id='target'",
      )
    ).rows[0].deadline,
    /2030/,
  );
  await db.close();
});
