import { test } from "node:test";
import assert from "node:assert/strict";
import { PostgresRegistry } from "../../src/lib/gcs/postgres-registry.mjs";
import { PrismaRegistry } from "../../src/lib/gcs/prisma-registry.mjs";
function fixture(kind) {
  let committed = {
    owner: "synthetic-owner",
    document: {
      id: "synthetic-id",
      owner: "synthetic-owner",
      expiresAt: 900000,
      maxExpiresAt: 86400000,
    },
    result: null,
  };
  let working;
  const query = async (sql, args) => {
    if (sql.startsWith("SELECT")) {
      assert.match(sql, /FOR UPDATE$/);
      return { rows: [working] };
    }
    if (sql.startsWith("UPDATE")) {
      assert.equal(args[0], "synthetic-id");
      working.document =
        typeof args[1] === "string" ? JSON.parse(args[1]) : args[1];
      working.expiry = args[2];
      return { rows: [] };
    }
    throw Error("Unexpected SQL");
  };
  const client = {
    query: async (sql, args) => {
      if (sql === "BEGIN") {
        working = structuredClone(committed);
        return { rows: [] };
      }
      if (sql === "COMMIT") {
        committed = working;
        return { rows: [] };
      }
      if (sql === "ROLLBACK") {
        working = null;
        return { rows: [] };
      }
      return query(sql, args);
    },
    release() {},
  };
  const prisma = {
    $transaction: async (run) => {
      working = structuredClone(committed);
      try {
        const result = await run({
          $queryRawUnsafe: async (sql, ...args) =>
            (await query(sql, args)).rows,
          $executeRawUnsafe: async (sql, ...args) => query(sql, args),
        });
        committed = working;
        return result;
      } catch (error) {
        working = null;
        throw error;
      }
    },
  };
  return {
    registry:
      kind === "pg"
        ? new PostgresRegistry({ connect: async () => client })
        : new PrismaRegistry(prisma),
    state: () => committed,
    setCompleted: () => {
      committed.result = { assetId: "synthetic" };
    },
  };
}
for (const kind of ["pg", "prisma"]) {
  test(
    kind +
      " renewal persists short permit but retains original absolute cleanup deadline",
    async () => {
      const f = fixture(kind);
      const result = await f.registry.renewOnce(
        "synthetic-id",
        "synthetic-owner",
        async (record) => {
          record.expiresAt = 1800000;
          return { policy: { synthetic: true } };
        },
      );
      assert.deepEqual(result, { policy: { synthetic: true } });
      assert.equal(f.state().document.expiresAt, 1800000);
      assert.equal(f.state().document.maxExpiresAt, 86400000);
      assert.equal(f.state().expiry.getTime(), 86400000);
    },
  );
  test(
    kind +
      " completed renewal replays response without reissuing storage policy",
    async () => {
      const f = fixture(kind);
      f.setCompleted();
      let policies = 0;
      assert.deepEqual(
        await f.registry.renewOnce(
          "synthetic-id",
          "synthetic-owner",
          async () => {
            policies++;
          },
        ),
        { complete: { assetId: "synthetic" } },
      );
      assert.equal(policies, 0);
    },
  );
  test(
    kind + " renewal failure rolls back document and refuses another owner",
    async () => {
      const f = fixture(kind);
      await assert.rejects(
        f.registry.renewOnce(
          "synthetic-id",
          "synthetic-owner",
          async (record) => {
            record.expiresAt = 1800000;
            throw Error("signing failed");
          },
        ),
        /signing failed/,
      );
      assert.equal(f.state().document.expiresAt, 900000);
      let writes = 0;
      await assert.rejects(
        f.registry.renewOnce("synthetic-id", "wrong-owner", async () => {
          writes++;
        }),
        /owner/,
      );
      assert.equal(writes, 0);
    },
  );
}
