import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyCompletedUpload } from "../../src/lib/gcs/owned-upload.mjs";
const key = "uploads/afters/owner/id";
const record = {
  app: "afters",
  route: "vibezPost",
  owner: "event:e:subject:s",
  key,
  result: { key },
};
const options = {
  app: "afters",
  route: "vibezPost",
  owner: record.owner,
  bucket: "synthetic",
  origins: ["https://afters.am"],
  url: "https://afters.am/api/assets/gcp?key=" + encodeURIComponent(key),
  store: { stat: async () => ({ metadata: { uploadid: "synthetic-id" } }) },
  registry: { get: async () => record },
};
test("only completed caller/event/route-bound uploads can become feed posts", async () => {
  assert.equal(await verifyCompletedUpload(options), true);
  for (const change of [
    { owner: "event:other:subject:s" },
    { route: "feedbackScreenshot" },
    { app: "other" },
    {
      url: "https://evil.invalid/api/assets/gcp?key=" + encodeURIComponent(key),
    },
  ])
    assert.equal(await verifyCompletedUpload({ ...options, ...change }), false);
  assert.equal(
    await verifyCompletedUpload({
      ...options,
      registry: { get: async () => ({ ...record, result: null }) },
    }),
    false,
  );
});
