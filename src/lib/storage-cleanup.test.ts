import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { processStorageCleanup } from "./storage-cleanup";
import type { db as productionDb } from "./db";
async function fixture() {
  const pg = new PGlite();
  await pg.exec(
    `create table assets(id text,storage_key text,url text);create table folder_storage_cleanup(storage_key text primary key,attempts integer not null default 0,last_error text,next_attempt_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now());insert into folder_storage_cleanup(storage_key)values('orphan');`,
  );
  return { pg, db: drizzle(pg) as unknown as typeof productionDb };
}
test("failed storage deletion remains durable and retries successfully", async () => {
  const { pg, db } = await fixture();
  await processStorageCleanup(
    50,
    async () => {
      throw new Error("provider unavailable");
    },
    db,
  );
  const failed = (
    await pg.query<{ attempts: number; last_error: string }>(
      "select attempts,last_error from folder_storage_cleanup",
    )
  ).rows[0];
  assert.equal(failed.attempts, 1);
  assert.equal(failed.last_error, "provider unavailable");
  await pg.exec("update folder_storage_cleanup set next_attempt_at=now()");
  const retry = await processStorageCleanup(50, async () => true, db);
  assert.equal(retry.deleted, 1);
  assert.equal(
    (await pg.query("select * from folder_storage_cleanup")).rows.length,
    0,
  );
  await pg.close();
});
test("cleanup never deletes bytes with a remaining asset reference", async () => {
  const { pg, db } = await fixture();
  await pg.exec(
    "insert into assets values('duplicate','orphan','https://x/f/orphan')",
  );
  let deleted = false;
  await processStorageCleanup(
    50,
    async () => {
      deleted = true;
      return true;
    },
    db,
  );
  assert.equal(deleted, false);
  assert.equal(
    (await pg.query("select * from folder_storage_cleanup")).rows.length,
    1,
  );
  await pg.close();
});
