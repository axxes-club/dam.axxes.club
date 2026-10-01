import { test } from "node:test";
import assert from "node:assert/strict";
import { handlers } from "../../src/lib/gcs/http-server.mjs";
import { createUploader } from "../../src/lib/gcs/browser.mjs";
import { StorageError } from "../../src/lib/gcs/core.mjs";
test("HTTP control rejects large JSON before authorization", async () => {
  let calls = 0;
  const h = handlers(
    {
      init: async () => {
        calls++;
      },
    },
    { resolveKey: () => "" },
  );
  const r = await h.POST(
    new Request("https://dam.axxes.club/api/storage", {
      method: "POST",
      body: " ".repeat(256 * 1024 + 1),
    }),
  );
  assert.equal(r.status, 413);
  assert.equal(calls, 0);
});
test("read redirect is noncacheable and delegates authorization rather than making bucket public", async () => {
  const h = handlers(
    {
      read: async (request, key, authorize) => {
        assert.equal(key, "imports/uploadthing/k");
        assert.equal(await authorize(), true);
        return "https://storage.googleapis.com/synthetic-signed";
      },
    },
    {
      resolveKey: () => "imports/uploadthing/k",
      authorizeRead: async () => true,
    },
  );
  const r = await h.GET(new Request("https://dam.axxes.club/api/assets/gcp"));
  assert.equal(r.status, 307);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(r.headers.get("vary"), "Cookie, Authorization");
});
test("HTTP does not expose SDK errors or credentials", async () => {
  const h = handlers(
    {
      read: async () => {
        throw Error("synthetic internal credential details");
      },
    },
    { resolveKey: () => "imports/uploadthing/k" },
  );
  const r = await h.GET(new Request("https://dam.axxes.club/api/assets/gcp"));
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: "Storage request failed" });
});
test("browser protocol preserves auth headers/input/progress and waits for completion callback", async () => {
  const requests = [],
    uploads = [],
    progress = [];
  const files = [
    { name: "a.jpg", type: "image/jpeg", size: 1024 },
    { name: "b.pdf", type: "application/pdf", size: 2048 },
  ];
  const fetchImpl = async (url, options) => {
    requests.push(options);
    const body = JSON.parse(options.body);
    return Response.json(
      body.action === "init"
        ? files.map((_, i) => ({
            uploadId: "id" + i,
            policy: { fields: { key: "staging/" + i } },
          }))
        : body.action === "renew"
          ? { policy: { fields: { key: "staging/" + body.uploadId.slice(2) } } }
          : {
              url: "https://dam.axxes.club/asset/" + body.uploadId,
              ufsUrl: "https://dam.axxes.club/asset/" + body.uploadId,
              serverData: { assetId: body.uploadId },
            },
    );
  };
  const uploader = createUploader({
    fetchImpl,
    postImpl: async (file, policy, notify) => {
      uploads.push(policy.fields.key);
      notify(0.5);
      notify(1);
    },
  });
  const result = await uploader("handoffUploader", {
    files,
    input: { token: "synthetic-token" },
    headers: () => ({ "x-handoff-token": "synthetic-header" }),
    onUploadProgress: (p) => progress.push(p),
  });
  assert.equal(result[1].serverData.assetId, "id1");
  assert.deepEqual(uploads, ["staging/0", "staging/1"]);
  assert.equal(progress.at(-1), 100);
  assert.ok(progress.some((p) => p > 0 && p < 100));
  for (const request of requests) {
    assert.equal(request.credentials, "same-origin");
    assert.equal(request.headers["x-handoff-token"], "synthetic-header");
    assert.deepEqual(JSON.parse(request.body).input, {
      token: "synthetic-token",
    });
  }
});
test("browser never invokes completion after storage failure", async () => {
  let completes = 0;
  const uploader = createUploader({
    fetchImpl: async (url, o) => {
      const b = JSON.parse(o.body);
      if (b.action === "complete") completes++;
      return Response.json(
        b.action === "renew"
          ? { policy: {} }
          : [{ uploadId: "id", policy: {} }],
      );
    },
    postImpl: async () => {
      throw Error("GCS failed");
    },
  });
  await assert.rejects(
    uploader("image", {
      files: [{ name: "a.jpg", type: "image/jpeg", size: 10 }],
    }),
    /GCS failed/,
  );
  assert.equal(completes, 0);
});

test("browser renews each queued large file just before starting rather than reusing expired batch policies", async () => {
  let clock = 0;
  const renewals = [],
    waiting = [];
  const files = Array.from({ length: 10 }, (_, i) => ({
    name: "video" + i + ".mp4",
    size: 512 * 1024 * 1024,
    type: "video/mp4",
  }));
  const upload = createUploader({
    fetchImpl: async (_url, o) => {
      const b = JSON.parse(o.body);
      if (b.action === "init")
        return Response.json(
          files.map((_, i) => ({
            uploadId: String(i),
            policy: { expires: 15 * 60000 },
          })),
        );
      if (b.action === "renew") {
        renewals.push(b.uploadId);
        return Response.json({ policy: { expires: clock + 15 * 60000 } });
      }
      return Response.json({
        key: b.uploadId,
        serverData: { assetId: b.uploadId },
      });
    },
    postImpl: async (file, policy) => {
      assert.ok(policy.expires > clock, "starting policy must be valid");
      if (waiting.length < 3) {
        await new Promise((resolve) => {
          waiting.push(resolve);
          if (waiting.length === 3) {
            clock = 20 * 60000;
            waiting.forEach((r) => r());
          }
        });
      }
    },
  });
  const result = await upload("assetUploader", { files });
  assert.equal(result.length, 10);
  assert.equal(renewals.length, 10);
  assert.equal(result[9].serverData.assetId, "9");
});
