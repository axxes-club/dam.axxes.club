import { test } from "node:test";
import assert from "node:assert/strict";
import { createProviderUpload } from "../../src/lib/gcs/provider.mjs";
test("disabled flag preserves legacy provider while true uses GCS", async () => {
  const called = [];
  for (const enabled of [false, true]) {
    const upload = createProviderUpload({
      fetchImpl: async () => Response.json({ enabled }),
      gcsUpload: async (...args) => {
        called.push(["gcs", ...args]);
        return ["gcs"];
      },
      legacyUpload: async (...args) => {
        called.push(["legacy", ...args]);
        return ["legacy"];
      },
    });
    assert.deepEqual(
      await upload("photo", { files: [], input: { synthetic: true } }),
      [enabled ? "gcs" : "legacy"],
    );
  }
  assert.deepEqual(
    called.map((c) => c[0]),
    ["legacy", "gcs"],
  );
  assert.deepEqual(called[1][2].input, { synthetic: true });
});
test("configuration errors fail closed without fallback or upload", async () => {
  let called = false;
  const upload = createProviderUpload({
    fetchImpl: async () => new Response("", { status: 503 }),
    gcsUpload: async () => {
      called = true;
    },
    legacyUpload: async () => {
      called = true;
    },
  });
  await assert.rejects(upload("photo", {}));
  assert.equal(called, false);
});
