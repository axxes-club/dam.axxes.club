import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { GoogleStore } from "../../src/lib/gcs/google-store.mjs";
test("actual SDK signs bounded POST policy with owner metadata and no public ACL", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const storage = new Storage({
    projectId: "synthetic-test-project",
    credentials: {
      client_email: "synthetic@example.invalid",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    },
  });
  const store = new GoogleStore({
    storage,
    bucket: "synthetic-private-bucket",
  });
  const policy = await store.signPost(
    "staging/dam/owner/file",
    { name: "photo.jpg", type: "image/jpeg", size: 1024 },
    { owner: "synthetic-owner", visibility: "private" },
    Date.now() + 900000,
  );
  const p = JSON.parse(Buffer.from(policy.fields.policy, "base64").toString());
  assert.ok(
    p.conditions.some(
      (c) =>
        Array.isArray(c) &&
        c[0] === "content-length-range" &&
        c[1] === 1024 &&
        c[2] === 1024,
    ),
  );
  assert.ok(p.conditions.some((c) => c["Content-Type"] === "image/jpeg"));
  assert.ok(
    p.conditions.some((c) => c["x-goog-meta-owner"] === "synthetic-owner"),
  );
  assert.equal(policy.fields["x-goog-acl"], undefined);
  assert.equal(policy.fields.acl, undefined);
  assert.equal(policy.fields.key, "staging/dam/owner/file");
  assert.match(
    policy.url,
    /^https:\/\/storage.googleapis.com\/synthetic-private-bucket/,
  );
});
test("read URL is SDK-signed and generation-bound", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const storage = new Storage({
    projectId: "synthetic",
    credentials: {
      client_email: "synthetic@example.invalid",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    },
  });
  const store = new GoogleStore({
    storage,
    bucket: "synthetic-private-bucket",
  });
  const u = new URL(
    await store.readUrl("imports/uploadthing/key", "7", Date.now() + 300000),
  );
  assert.equal(u.searchParams.get("generation"), "7");
  assert.equal(u.searchParams.get("X-Goog-Algorithm"), "GOOG4-RSA-SHA256");
});
