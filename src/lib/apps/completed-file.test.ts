import test from "node:test";
import assert from "node:assert/strict";
import { completedFile } from "./completed-file";
test("provider completion accepts filename extensions and rejects forged storage", () => {
  const file = { key: "abc123_file.jpg", name: "photo.jpg", url: "https://project.ufs.sh/f/abc123_file.jpg", type: "image/jpeg", size: 12 };
  assert.deepEqual(completedFile(file), file);
  assert.throws(() => completedFile({ ...file, url: "https://project.ufs.sh.evil.example/f/abc123_file.jpg" }));
  assert.throws(() => completedFile({ ...file, url: "https://project.ufs.sh/f/another-key.jpg" }));
  assert.throws(() => completedFile({ ...file, size: Number.NaN }));
  assert.throws(() => completedFile({ ...file, size: 64 * 1024 * 1024 + 1 }));
});
