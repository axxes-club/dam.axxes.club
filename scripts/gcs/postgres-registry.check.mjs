import { test } from "node:test";
import assert from "node:assert/strict";
import { PostgresRegistry } from "../../src/lib/gcs/postgres-registry.mjs";
function fixture(owner = "tenant:a") {
  let row = { owner, document: { id: "synthetic", owner }, result: null },
    working;
  const client = {
    async query(sql, args) {
      if (sql === "BEGIN") {
        working = structuredClone(row);
        return { rows: [] };
      }
      if (sql.startsWith("SELECT")) {
        assert.match(sql, /FOR UPDATE$/);
        return { rows: [working] };
      }
      if (sql.startsWith("UPDATE")) {
        assert.deepEqual(args[0], "synthetic");
        working.result = args[1];
        return { rows: [] };
      }
      if (sql === "COMMIT") {
        row = working;
        return { rows: [] };
      }
      if (sql === "ROLLBACK") {
        working = null;
        return { rows: [] };
      }
      throw Error("Unexpected SQL");
    },
    release() {},
  };
  return {
    registry: new PostgresRegistry({ connect: async () => client }),
    client,
    state: () => row,
  };
}
test("receipt completion retries return committed callback data without repeating writes", async () => {
  const f = fixture();
  let count = 0;
  const run = async (record, tx) => {
    assert.equal(tx, f.client);
    count++;
    return { assetId: "a" };
  };
  assert.deepEqual(
    await f.registry.completeOnce("synthetic", "tenant:a", run),
    { assetId: "a" },
  );
  assert.deepEqual(
    await f.registry.completeOnce("synthetic", "tenant:a", run),
    { assetId: "a" },
  );
  assert.equal(count, 1);
  assert.deepEqual(f.state().result, { assetId: "a" });
});
test("callback failure rolls back receipt, permitting retry", async () => {
  const f = fixture();
  await assert.rejects(
    f.registry.completeOnce("synthetic", "tenant:a", async () => {
      throw Error("DB insert failed");
    }),
    /DB insert failed/,
  );
  assert.equal(f.state().result, null);
  assert.deepEqual(
    await f.registry.completeOnce("synthetic", "tenant:a", async () => ({
      assetId: "retry",
    })),
    { assetId: "retry" },
  );
});
test("locked receipt rejects another owner before callback", async () => {
  const f = fixture();
  let writes = 0;
  await assert.rejects(
    f.registry.completeOnce("synthetic", "tenant:b", async () => {
      writes++;
    }),
    /owner/,
  );
  assert.equal(writes, 0);
  assert.equal(f.state().result, null);
});
