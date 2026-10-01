import test from "node:test";
import assert from "node:assert/strict";
import { LocalPreviews } from "../../src/lib/gcs/local-previews.mjs";
test("mobile completion previews selected bytes locally and revokes them without private URLs or capability leakage", () => {
  let count = 0;
  const created = [],
    revoked = [];
  const urls = {
    createObjectURL: (file) => {
      created.push(file);
      return `blob:synthetic-${++count}`;
    },
    revokeObjectURL: (url) => revoked.push(url),
  };
  const previews = new LocalPreviews(urls);
  const file = new Blob(["synthetic"]);
  previews.select([file]);
  assert.deepEqual(previews.complete(), ["blob:synthetic-1"]);
  assert.deepEqual(created, [file]);
  assert.deepEqual(previews.complete(), []);
  previews.select([file]);
  assert.deepEqual(previews.complete(), ["blob:synthetic-2"]);
  previews.dispose();
  assert.deepEqual(revoked, ["blob:synthetic-1", "blob:synthetic-2"]);
  previews.dispose();
  assert.equal(revoked.length, 2);
});
