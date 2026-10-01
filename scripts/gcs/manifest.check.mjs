import { test } from "node:test";
import assert from "node:assert/strict";
import { verifiedAliases } from "../../src/lib/gcs/manifest.mjs";
test("only copied and verified aliases become available", () => {
  const x = verifiedAliases(
    {
      bucket: "private",
      URL_map: {
        "https://test.ufs.sh/f/a": { object_name: "imports/uploadthing/a" },
        "https://test.ufs.sh/f/b": { object_name: "imports/uploadthing/b" },
      },
    },
    {
      bucket: "private",
      objects: [
        { object_name: "imports/uploadthing/a", copy_status: "verified" },
        { object_name: "imports/uploadthing/b", copy_status: "failed" },
      ],
    },
    "private",
  );
  assert.deepEqual([...x.verifiedKeys], ["imports/uploadthing/a"]);
  assert.deepEqual(Object.keys(x.aliases), ["https://test.ufs.sh/f/a"]);
});
test("refuses aliases from a different bucket", () =>
  assert.throws(() =>
    verifiedAliases(
      { bucket: "other", URL_map: {} },
      { bucket: "private", objects: [] },
      "private",
    ),
  ));
