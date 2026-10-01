import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaRegistry } from "../../src/lib/gcs/prisma-registry.mjs";
test("Prisma callback and receipt share transaction and replay committed data", async () => {
  const row = {
    owner: "tenant:a",
    document: { id: "id", owner: "tenant:a" },
    result: null,
  };
  const transaction = {
    $queryRawUnsafe: async (sql, id) => {
      assert.match(sql, /FOR UPDATE$/);
      assert.equal(id, "id");
      return [row];
    },
    $executeRawUnsafe: async (sql, id, result) => {
      assert.equal(id, "id");
      row.result = JSON.parse(result);
    },
  };
  const prisma = { $transaction: async (run) => run(transaction) };
  const registry = new PrismaRegistry(prisma);
  let writes = 0;
  const callback = async (record, tx) => {
    assert.equal(tx, transaction);
    writes++;
    return { photoId: "photo" };
  };
  assert.deepEqual(await registry.completeOnce("id", "tenant:a", callback), {
    photoId: "photo",
  });
  assert.deepEqual(await registry.completeOnce("id", "tenant:a", callback), {
    photoId: "photo",
  });
  assert.equal(writes, 1);
});
