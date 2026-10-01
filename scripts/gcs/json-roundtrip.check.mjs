import test from "node:test";
import assert from "node:assert/strict";
import { Adapter } from "../../src/lib/gcs/core.mjs";
import { createUploadthing, compileRouter } from "../../src/lib/gcs/router.mjs";
import { PostgresRegistry } from "../../src/lib/gcs/postgres-registry.mjs";
import { PrismaRegistry } from "../../src/lib/gcs/prisma-registry.mjs";
const clone = (value) => JSON.parse(JSON.stringify(value));
// Only SQL transport is substituted; real registries serialize/deserialize their documents.
function registry(kind) {
  let row;
  const query = async (sql, args = []) => {
    if (sql.startsWith("INSERT"))
      row = {
        owner: args[1],
        document: clone(
          typeof args[2] === "string" ? JSON.parse(args[2]) : args[2],
        ),
        result: null,
      };
    if (sql.startsWith("SELECT")) return { rows: row ? [clone(row)] : [] };
    if (sql.startsWith("UPDATE")) {
      const value = typeof args[1] === "string" ? JSON.parse(args[1]) : args[1];
      if (sql.includes("SET document")) row.document = clone(value);
      else row.result = clone(value);
    }
    return { rows: [] };
  };
  const client = { query, release() {} };
  const prisma = {
    $executeRawUnsafe: (sql, ...args) => query(sql, args),
    $queryRawUnsafe: async (sql, ...args) => (await query(sql, args)).rows,
  };
  prisma.$transaction = (run) => run(prisma);
  return kind === "Postgres"
    ? new PostgresRegistry({ query, connect: async () => client })
    : new PrismaRegistry(prisma);
}
for (const kind of ["Postgres", "Prisma"])
  test(`${kind} real registry JSON roundtrip preserves guest renew, complete and resource binding`, async () => {
    let resource = "event-a",
      callbacks = 0;
    const f = createUploadthing();
    const routes = compileRouter(
      {
        guest: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
          .middleware(async () => ({
            userId: undefined,
            eventId: resource,
            guestId: "guest-a",
            spotId: undefined,
            nested: { optional: undefined, accepted: true },
            tokenStr: "synthetic-never-persist",
          }))
          .onUploadComplete(async ({ metadata }) => {
            callbacks++;
            assert.equal("userId" in metadata, false);
            assert.equal("spotId" in metadata, false);
            assert.equal("tokenStr" in metadata, false);
            return { photoId: "synthetic" };
          }),
      },
      { guest: "private" },
    );
    let object;
    const store = {
      assertPrivate: async () => {},
      signPost: async (key, descriptor, metadata) => {
        object = {
          key,
          size: descriptor.size,
          contentType: descriptor.type,
          generation: "1",
          metadata,
        };
        return { url: "https://storage.invalid", fields: { key } };
      },
      stat: async () => object,
      freeze: async () => object,
      delete: async () => {
        object = null;
      },
    };
    const adapter = new Adapter({
      app: "vibez",
      bucket: "private-bucket",
      baseUrl: "https://vibez.axxes.club",
      routes,
      store,
      registry: registry(kind),
    });
    const request = new Request("https://vibez.axxes.club/api/storage", {
      headers: { origin: "https://vibez.axxes.club" },
    });
    const [receipt] = await adapter.init(request, "guest", [
      { name: "synthetic.png", type: "image/png", size: 123 },
    ]);
    assert.ok((await adapter.renew(request, receipt.uploadId)).policy);
    const completed = await adapter.complete(request, receipt.uploadId);
    assert.equal(completed.serverData.photoId, "synthetic");
    assert.deepEqual(await adapter.renew(request, receipt.uploadId), {
      complete: completed,
    });
    assert.deepEqual(
      await adapter.complete(request, receipt.uploadId),
      completed,
    );
    assert.equal(callbacks, 1);
    resource = "event-b";
    await assert.rejects(adapter.renew(request, receipt.uploadId), /mismatch/);
    await assert.rejects(
      adapter.complete(request, receipt.uploadId),
      /mismatch/,
    );
  });
for (const kind of ["Postgres", "Prisma"])
  test(`${kind} continuation reauthorizes bans but not expired admission tickets or exhausted new-upload quota`, async () => {
    let clock = 1000,
      quota = 0,
      banned = false,
      callbacks = 0;
    const phases = [];
    const f = createUploadthing();
    const routes = compileRouter(
      {
        guest: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
          .middleware(async ({ phase }) => {
            phases.push(phase);
            if (banned) throw Error("Banned");
            if (phase !== "continue" && phase !== "replay") {
              if (clock > 301000) throw Error("Ticket expired");
              if (quota >= 1) throw Error("Quota reached");
            }
            return {
              eventId: "event-a",
              guestId: "guest-a",
              userId: undefined,
            };
          })
          .onUploadComplete(async () => {
            callbacks++;
            quota++;
            return { photoId: "last-allowed" };
          }),
      },
      { guest: "private" },
    );
    let object;
    const store = {
      assertPrivate: async () => {},
      signPost: async (key, descriptor, metadata) => {
        object = {
          size: descriptor.size,
          contentType: descriptor.type,
          generation: "1",
          metadata,
        };
        return { url: "https://storage.invalid", fields: { key } };
      },
      stat: async () => object,
      freeze: async () => object,
      delete: async () => {
        object = null;
      },
    };
    const adapter = new Adapter({
      app: "vibez",
      bucket: "private-bucket",
      baseUrl: "https://vibez.axxes.club",
      routes,
      store,
      registry: registry(kind),
      now: () => clock,
    });
    const request = new Request("https://vibez.axxes.club/api/storage", {
      headers: { origin: "https://vibez.axxes.club" },
    });
    const [receipt] = await adapter.init(
      request,
      "guest",
      [{ name: "synthetic.png", type: "image/png", size: 123 }],
      { phase: "replay" },
    );
    clock += 10 * 60000;
    assert.ok((await adapter.renew(request, receipt.uploadId)).policy);
    const result = await adapter.complete(request, receipt.uploadId);
    assert.equal(quota, 1);
    assert.deepEqual(await adapter.complete(request, receipt.uploadId), result);
    assert.deepEqual(await adapter.renew(request, receipt.uploadId), {
      complete: result,
    });
    assert.equal(callbacks, 1);
    assert.deepEqual(phases, [
      "init",
      "continue",
      "continue",
      "replay",
      "replay",
    ]);
    banned = true;
    await assert.rejects(adapter.complete(request, receipt.uploadId), /Banned/);
    await assert.rejects(adapter.renew(request, receipt.uploadId), /Banned/);
  });
