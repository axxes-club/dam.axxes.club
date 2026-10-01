import { test } from "node:test";
import assert from "node:assert/strict";
import { createUploadthing, compileRouter } from "../../src/lib/gcs/router.mjs";
test("router validates input before existing auth, derives principal scope and preserves transaction", async () => {
  let calls = 0,
    seen;
  const f = createUploadthing();
  const router = {
    photo: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
      .input({
        parseAsync: async (value) => {
          if (value.token !== "synthetic") throw Error("invalid token");
          return value;
        },
      })
      .middleware(async ({ input }) => {
        calls++;
        return {
          userId: "user-a",
          tenantId: "tenant-a",
          tokenStr: input.token,
        };
      })
      .onUploadComplete(async (value) => {
        seen = value;
        return { assetId: "asset-a" };
      }),
  };
  const routes = compileRouter(router, { photo: "private" });
  await assert.rejects(
    routes.photo.authorize(new Request("https://app.invalid"), {
      token: "bad",
    }),
  );
  assert.equal(calls, 0);
  const auth = await routes.photo.authorize(
    new Request("https://app.invalid"),
    { token: "synthetic" },
  );
  assert.equal(auth.owner, "tenant:tenant-a:user:user-a");
  assert.equal(auth.metadata.tokenStr, undefined);
  assert.deepEqual(routes.photo.files.image, { bytes: 4194304, count: 1 });
  const tx = { synthetic: true };
  assert.deepEqual(
    await routes.photo.complete({
      metadata: auth.metadata,
      file: { url: "synthetic" },
      transaction: tx,
    }),
    { assetId: "asset-a" },
  );
  assert.equal(seen.transaction, tx);
});
test("tenant without principal and shared literal organizer cannot own an upload", async () => {
  const f = createUploadthing();
  for (const metadata of [
    { tenantId: "t" },
    { eventId: "e", guestId: "organizer" },
  ]) {
    const routes = compileRouter(
      {
        p: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
          .middleware(async () => metadata)
          .onUploadComplete(async () => null),
      },
      { p: "private" },
    );
    await assert.rejects(
      routes.p.authorize(new Request("https://app.invalid")),
      /principal/,
    );
  }
});
test("event subject and handoff session are scoped owners", async () => {
  const f = createUploadthing();
  for (const metadata of [
    { eventId: "e", subject: "guest-a" },
    { tenantId: "t", sessionId: 7 },
  ]) {
    const routes = compileRouter(
      {
        p: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
          .middleware(async () => metadata)
          .onUploadComplete(async () => null),
      },
      { p: "private" },
    );
    assert.ok(
      (
        await routes.p.authorize(new Request("https://app.invalid"))
      ).owner.includes(metadata.subject ?? "7"),
    );
  }
});
