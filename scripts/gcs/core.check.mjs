import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Adapter,
  validateFiles,
  objectKeyFromUrl,
  assertPrivateBucket,
  corsForOrigins,
} from "../../src/lib/gcs/core.mjs";
const rule = {
  image: { bytes: 4 * 1024 * 1024, count: 2 },
  pdf: { bytes: 16 * 1024 * 1024, count: 1 },
};
const file = { name: "photo.jpg", type: "image/jpeg", size: 1024 };
function setup() {
  const rows = new Map(),
    objects = new Map();
  let callbacks = 0,
    authorizations = 0,
    copies = 0,
    clock = 1000;
  const store = {
    async assertPrivate() {},
    async signPost(key, descriptor, metadata) {
      return {
        url: "https://storage.googleapis.com/private-bucket/",
        fields: { key, ...metadata },
      };
    },
    async stat(key) {
      return objects.get(key);
    },
    async freeze(from, to, generation, metadata) {
      copies++;
      const item = objects.get(from);
      assert.equal(item.generation, generation);
      objects.set(to, { ...item, metadata });
      return objects.get(to);
    },
    async readUrl() {
      return "https://storage.googleapis.com/private-bucket/synthetic-read";
    },
    async delete(key, generation) {
      assert.equal(objects.get(key).generation, generation);
      objects.delete(key);
    },
  };
  const registry = {
    async create(record) {
      rows.set(record.id, record);
    },
    async get(id) {
      return rows.get(id);
    },
    async renewOnce(id, owner, run) {
      const r = rows.get(id);
      assert.equal(r.owner, owner);
      return r.result ? { complete: r.result } : run(r, {});
    },
    async completeOnce(id, owner, run) {
      const r = rows.get(id);
      assert.equal(r.owner, owner);
      if (r.result) return r.result;
      r.result = await run(r, {});
      return r.result;
    },
  };
  const route = {
    files: rule,
    visibility: "private",
    async authorize(request) {
      authorizations++;
      if (request.headers.get("x-test-deny")) throw new Error("Denied");
      return {
        owner: request.headers.get("x-test-owner") ?? "tenant:a",
        metadata: { folder: "original" },
      };
    },
    async complete({ file, metadata, uploadId }) {
      callbacks++;
      assert.equal(metadata.folder, "original");
      assert.ok(uploadId);
      return { assetId: "synthetic", url: file.url };
    },
  };
  const adapter = new Adapter({
    app: "dam",
    bucket: "private-bucket",
    baseUrl: "https://dam.axxes.club",
    routes: { assetUploader: route },
    store,
    registry,
    now: () => clock,
  });
  const request = (headers = {}) =>
    new Request("https://dam.axxes.club/api/storage", {
      method: "POST",
      headers: { origin: "https://dam.axxes.club", ...headers },
    });
  return {
    adapter,
    store,
    registry,
    rows,
    objects,
    request,
    advance: (milliseconds) => {
      clock += milliseconds;
    },
    counts: () => ({ callbacks, authorizations, copies }),
  };
}
for (const [label, files] of [
  ["oversize", [{ ...file, size: 4 * 1024 * 1024 + 1 }]],
  ["negative", [{ ...file, size: -1 }]],
  ["fractional", [{ ...file, size: 1.5 }]],
  ["too many", [file, file, file]],
  ["bad MIME", [{ ...file, type: "application/x-executable" }]],
  ["unsafe filename", [{ ...file, name: "../x.jpg" }]],
])
  test("rejects " + label, () =>
    assert.throws(() => validateFiles(files, rule)),
  );
test("mixed image/PDF limits apply independently", () =>
  assert.doesNotThrow(() =>
    validateFiles(
      [
        file,
        file,
        {
          name: "receipt.pdf",
          type: "application/pdf",
          size: 16 * 1024 * 1024,
        },
      ],
      rule,
    ),
  ));
test("rejects public bucket and disabled uniform access", () => {
  assert.throws(() =>
    assertPrivateBucket({
      iamConfiguration: {
        publicAccessPrevention: "inherited",
        uniformBucketLevelAccess: { enabled: true },
      },
    }),
  );
  assert.throws(() =>
    assertPrivateBucket({
      iamConfiguration: {
        publicAccessPrevention: "enforced",
        uniformBucketLevelAccess: { enabled: false },
      },
    }),
  );
  assert.doesNotThrow(() =>
    assertPrivateBucket({
      iamConfiguration: {
        publicAccessPrevention: "enforced",
        uniformBucketLevelAccess: { enabled: true },
      },
    }),
  );
});
test("CORS permits exact HTTPS origins and POST without wildcard credentials", () => {
  assert.deepEqual(corsForOrigins(["https://dam.axxes.club"]), [
    {
      origin: ["https://dam.axxes.club"],
      method: ["GET", "HEAD", "POST"],
      responseHeader: ["Content-Type", "Content-Length", "ETag"],
      maxAgeSeconds: 3600,
    },
  ]);
  assert.throws(() => corsForOrigins(["*"]));
  assert.throws(() => corsForOrigins(["http://dam.axxes.club"]));
});
test("rejects CSRF and unauthorized init before signing", async () => {
  const f = setup();
  await assert.rejects(
    f.adapter.init(
      f.request({ origin: "https://evil.invalid" }),
      "assetUploader",
      [file],
    ),
    /Origin/,
  );
  await assert.rejects(
    f.adapter.init(f.request({ "x-test-deny": "yes" }), "assetUploader", [
      file,
    ]),
    /Denied/,
  );
  assert.equal(f.rows.size, 0);
});
test("ownership is minted by authorization, never client key/input", async () => {
  const f = setup();
  const [u] = await f.adapter.init(f.request(), "assetUploader", [file], {
    owner: "tenant:b",
    key: "imports/other",
  });
  const r = f.rows.get(u.uploadId);
  assert.equal(r.owner, "tenant:a");
  assert.match(
    u.policy.fields.key,
    /^staging\/dam\/[a-f0-9]{32}\/[a-f0-9-]{36}$/,
  );
  assert.notEqual(u.policy.fields.key, "imports/other");
});
test("completion rejects another owner without callback", async () => {
  const f = setup();
  const [u] = await f.adapter.init(f.request(), "assetUploader", [file]);
  await assert.rejects(
    f.adapter.complete(f.request({ "x-test-owner": "tenant:b" }), u.uploadId),
    /owner/i,
  );
  assert.equal(f.counts().callbacks, 0);
});
test("completion checks actual size and bound owner metadata", async () => {
  for (const kind of ["size", "owner", "type"]) {
    const f = setup();
    const [u] = await f.adapter.init(f.request(), "assetUploader", [file]);
    const r = f.rows.get(u.uploadId);
    f.objects.set(r.staging, {
      size: kind === "size" ? 2048 : 1024,
      contentType: kind === "type" ? "application/pdf" : file.type,
      generation: "7",
      metadata: {
        ...r.objectMetadata,
        ...(kind === "owner" ? { owner: "attacker" } : {}),
      },
    });
    await assert.rejects(f.adapter.complete(f.request(), u.uploadId));
    assert.equal(f.counts().callbacks, 0);
  }
});
test("completion freezes generation, retains metadata, and returns stable URL once", async () => {
  const f = setup();
  const [u] = await f.adapter.init(f.request(), "assetUploader", [file]);
  const r = f.rows.get(u.uploadId);
  f.objects.set(r.staging, {
    size: 1024,
    contentType: file.type,
    generation: "7",
    metadata: r.objectMetadata,
  });
  const result = await f.adapter.complete(f.request(), u.uploadId);
  assert.equal(result.url, result.ufsUrl);
  assert.equal(result.serverData.assetId, "synthetic");
  assert.match(
    result.url,
    /^https:\/\/dam.axxes.club\/api\/assets\/gcp\?key=uploads/,
  );
  assert.deepEqual(await f.adapter.complete(f.request(), u.uploadId), result);
  assert.equal(f.counts().callbacks, 1);
  assert.equal(f.counts().copies, 1);
});
test("private reads and deletes require authorization, public reads remain logical only", async () => {
  const f = setup();
  const key = "imports/uploadthing/provider-key";
  f.objects.set(key, { generation: "2", metadata: { visibility: "private" } });
  await assert.rejects(
    f.adapter.read(f.request(), key, async () => false),
    /Denied/,
  );
  await assert.rejects(
    f.adapter.remove(f.request(), key, async () => false),
    /Denied/,
  );
  assert.ok(f.objects.has(key));
  await f.adapter.remove(f.request(), key, async () => true);
  assert.equal(f.objects.has(key), false);
  const publicKey = "uploads/dam/owner/public-image";
  f.objects.set(publicKey, {
    generation: "3",
    metadata: { visibility: "public" },
  });
  assert.match(
    await f.adapter.read(f.request(), publicKey, async () => false),
    /^https:/,
  );
});
for (const key of [
  "../other",
  "control/dam/receipt.json",
  "staging/dam/file",
  "imports/a/../b",
  "imports/a/%2e%2e/b",
  "imports/a\\b",
])
  test("denies key containment escape " + key, async () => {
    const f = setup();
    await assert.rejects(f.adapter.read(f.request(), key, async () => true));
  });
test("parses only exact bucket/stable origin or verified legacy aliases", () => {
  const opts = {
    bucket: "private-bucket",
    origins: ["https://dam.axxes.club"],
    verifiedKeys: new Set(["imports/uploadthing/provider-key"]),
  };
  assert.equal(
    objectKeyFromUrl("https://test.ufs.sh/f/provider-key", opts),
    "imports/uploadthing/provider-key",
  );
  assert.equal(
    objectKeyFromUrl(
      "https://storage.googleapis.com/private-bucket/imports/uploadthing/provider-key",
      opts,
    ),
    "imports/uploadthing/provider-key",
  );
  assert.equal(
    objectKeyFromUrl("https://evil.invalid/f/provider-key", opts),
    null,
  );
  assert.equal(
    objectKeyFromUrl("https://test.ufs.sh/f/unverified", opts),
    null,
  );
  assert.equal(
    objectKeyFromUrl(
      "https://storage.googleapis.com/other-bucket/imports/uploadthing/provider-key",
      opts,
    ),
    null,
  );
  assert.equal(
    objectKeyFromUrl(
      "https://dam.axxes.club/api/assets/gcp?key=imports%2Fuploadthing%2Fprovider-key",
      opts,
    ),
    "imports/uploadthing/provider-key",
  );
  assert.equal(objectKeyFromUrl("https://test.ufs.sh/f/%2e%2e", opts), null);
});
test("expired absolute upload lifetime cannot invoke database callback", async () => {
  const f = setup();
  const [u] = await f.adapter.init(f.request(), "assetUploader", [file]);
  f.rows.get(u.uploadId).expiresAt = 0;
  f.rows.get(u.uploadId).maxExpiresAt = 0;
  await assert.rejects(f.adapter.complete(f.request(), u.uploadId), /expired/);
  assert.equal(f.counts().callbacks, 0);
});
test("rejects normalized URL traversal even if the destination is verified", () => {
  const opts = {
    bucket: "private-bucket",
    verifiedKeys: new Set(["imports/uploadthing/key"]),
  };
  assert.equal(
    objectKeyFromUrl(
      "https://storage.googleapis.com/private-bucket/imports/a/../uploadthing/key",
      opts,
    ),
    null,
  );
  assert.equal(
    objectKeyFromUrl(
      "https://storage.googleapis.com/private-bucket/imports/a/%2e%2e/uploadthing/key",
      opts,
    ),
    null,
  );
});

test("queued file renewal reauthorizes same owner/descriptor and retains callback metadata", async () => {
  const f = setup();
  const [u] = await f.adapter.init(f.request(), "assetUploader", [file]);
  const r = f.rows.get(u.uploadId),
    initialKey = r.staging;
  f.advance(16 * 60000);
  const renewed = await f.adapter.renew(f.request(), u.uploadId, {
    owner: "evil",
    name: "evil",
  });
  assert.equal(renewed.policy.fields.key, initialKey);
  assert.deepEqual(r.descriptor, file);
  assert.equal(r.metadata.folder, "original");
  assert.equal(r.expiresAt, 1000 + 31 * 60000);
  await assert.rejects(
    f.adapter.renew(f.request({ "x-test-owner": "different" }), u.uploadId),
    /owner/i,
  );
  assert.equal(f.counts().callbacks, 0);
});
test("slow in-flight file may complete after short permit but within absolute lifetime", async () => {
  const f = setup();
  const [u] = await f.adapter.init(f.request(), "assetUploader", [file]);
  const r = f.rows.get(u.uploadId);
  f.objects.set(r.staging, {
    size: file.size,
    contentType: file.type,
    generation: "7",
    metadata: r.objectMetadata,
  });
  f.advance(20 * 60000);
  assert.equal(
    (await f.adapter.complete(f.request(), u.uploadId)).serverData.assetId,
    "synthetic",
  );
  assert.ok((await f.adapter.renew(f.request(), u.uploadId)).complete);
  assert.equal(f.counts().callbacks, 1);
});
test("renewal and completion cannot extend beyond absolute bounded upload lifetime", async () => {
  const f = setup();
  const [u] = await f.adapter.init(f.request(), "assetUploader", [file]);
  f.advance(24 * 60 * 60000 + 1);
  await assert.rejects(f.adapter.renew(f.request(), u.uploadId), /expired/i);
  await assert.rejects(f.adapter.complete(f.request(), u.uploadId), /expired/i);
  assert.equal(f.counts().callbacks, 0);
});

test("successful completion removes only the generation-verified staging payload after commit", async () => {
  const f = setup();
  const [u] = await f.adapter.init(f.request(), "assetUploader", [file]);
  const r = f.rows.get(u.uploadId);
  f.objects.set(r.staging, {
    size: file.size,
    contentType: file.type,
    generation: "7",
    metadata: r.objectMetadata,
  });
  const result = await f.adapter.complete(f.request(), u.uploadId);
  assert.equal(f.objects.has(r.staging), false);
  assert.ok(f.objects.has(r.key));
  assert.deepEqual(f.rows.get(u.uploadId).result, result);
});
test("staging cleanup failure cannot invalidate a committed receipt or duplicate callback writes", async () => {
  const f = setup();
  const [u] = await f.adapter.init(f.request(), "assetUploader", [file]);
  const r = f.rows.get(u.uploadId);
  f.objects.set(r.staging, {
    size: file.size,
    contentType: file.type,
    generation: "7",
    metadata: r.objectMetadata,
  });
  let deletes = 0;
  f.store.delete = async () => {
    deletes++;
    throw Error("synthetic deletion failure");
  };
  const result = await f.adapter.complete(f.request(), u.uploadId);
  assert.equal(deletes, 1);
  assert.deepEqual(await f.adapter.complete(f.request(), u.uploadId), result);
  assert.equal(deletes, 2);
  assert.equal(f.counts().callbacks, 1);
});

test("imported object metadata cannot bypass database resource authorization by claiming public visibility", async () => {
  const f = setup();
  const key = "imports/uploadthing/provider-key";
  f.objects.set(key, { generation: "3", metadata: { visibility: "public" } });
  await assert.rejects(
    f.adapter.read(f.request(), key, async () => false),
    /Denied/,
  );
});
test("renewal and completion cannot reauthorize a different folder for the same owner", async () => {
  const f = setup();
  const [upload] = await f.adapter.init(f.request(), "assetUploader", [file]);
  f.adapter.routes.assetUploader.authorize = async () => ({
    owner: "tenant:a",
    metadata: { folder: "different" },
  });
  await assert.rejects(
    f.adapter.renew(f.request(), upload.uploadId),
    /metadata mismatch/,
  );
  await assert.rejects(
    f.adapter.complete(f.request(), upload.uploadId),
    /metadata mismatch/,
  );
});
