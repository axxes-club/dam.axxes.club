import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAliases } from "../../src/lib/gcs/aliases.mjs";
test("private manifest loader only exposes verified keys and refreshes without leaking URLs to client", async () => {
  let reads = 0;
  const objects = {
    "control/source-url-to-gcs-object.json": {
      bucket: "synthetic-private-bucket",
      URL_map: {
        "https://utfs.io/f/synthetic": {
          object_name: "imports/uploadthing/synthetic",
        },
      },
    },
    "control/storage-copy-progress.json": {
      bucket: "synthetic-private-bucket",
      objects: [
        {
          object_name: "imports/uploadthing/synthetic",
          copy_status: "verified",
        },
      ],
    },
  };
  const storage = {
    bucket: (name) => {
      assert.equal(name, "synthetic-private-bucket");
      return {
        file: (key) => ({
          download: async () => {
            reads++;
            return [Buffer.from(JSON.stringify(objects[key]))];
          },
        }),
      };
    },
  };
  const load = loadAliases({ storage, bucket: "synthetic-private-bucket" });
  const first = await load();
  assert.equal(
    first.aliases["https://utfs.io/f/synthetic"].object_name,
    "imports/uploadthing/synthetic",
  );
  assert.equal(
    first.reverse["imports/uploadthing/synthetic"][0],
    "https://utfs.io/f/synthetic",
  );
  await load();
  assert.equal(reads, 2);
});
test("missing manifest is a migration error rather than silently authorizing imports", async () => {
  const load = loadAliases({
    bucket: "synthetic",
    storage: {
      bucket: () => ({
        file: () => ({
          download: async () => {
            throw Error("missing");
          },
        }),
      }),
    },
  });
  await assert.rejects(load(), /missing/);
});
