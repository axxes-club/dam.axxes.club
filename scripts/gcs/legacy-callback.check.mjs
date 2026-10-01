import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { legacyCallbackRequest } from "../../src/lib/gcs/legacy-callback.mjs";
const request = (
  hook,
  url = "https://synthetic.invalid/api/uploadthing?slug=probe",
  method = "POST",
) =>
  new Request(url, {
    method,
    headers: hook ? { "uploadthing-hook": hook } : undefined,
    ...(method === "POST" ? { body: ' {"files":[]}\n' } : {}),
  });
test("only callback/error POST with no actionType may delegate, without reading raw signed body", async () => {
  for (const hook of ["callback", "error"]) {
    const req = request(hook);
    assert.equal(legacyCallbackRequest(req), true);
    assert.equal(req.bodyUsed, false);
    assert.equal(await req.text(), ' {"files":[]}\n');
    for (const query of [
      "actionType=upload",
      "actionType=",
      "actionType=callback",
      "actionType=upload&actionType=",
    ])
      assert.equal(
        legacyCallbackRequest(
          request(
            hook,
            "https://synthetic.invalid/api/uploadthing?slug=probe&" + query,
          ),
        ),
        false,
      );
  }
  for (const hook of [null, "upload", "CALLBACK", "unknown"])
    assert.equal(legacyCallbackRequest(request(hook)), false);
  assert.equal(
    legacyCallbackRequest(request("callback", undefined, "GET")),
    false,
  );
});
test("actual installed SDK rejects delegated invalid HMAC before any middleware/callback/error hook", async () => {
  const require = createRequire(import.meta.url);
  const { createUploadthing, createRouteHandler } = require("uploadthing/next");
  let init = 0,
    callback = 0,
    error = 0;
  const f = createUploadthing();
  const token = Buffer.from(
    JSON.stringify({
      apiKey: "sk_synthetic_test_only_1234567890",
      appId: "synthetic",
      regions: ["sea1"],
    }),
  ).toString("base64");
  const legacy = createRouteHandler({
    router: {
      probe: f({ image: { maxFileSize: "4MB" } })
        .middleware(() => {
          init++;
          return {};
        })
        .onUploadError(() => {
          error++;
        })
        .onUploadComplete(() => {
          callback++;
          return {};
        }),
    },
    config: { token, isDev: false, logLevel: "Error" },
  });
  for (const hook of ["callback", "error"]) {
    const req = new Request(
      "https://synthetic.invalid/api/uploadthing?slug=probe",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "uploadthing-hook": hook,
          "x-uploadthing-signature": "hmac-sha256=00",
        },
        body: ' {"files":[]}\n',
      },
    );
    assert.equal(legacyCallbackRequest(req), true);
    const response = await legacy.POST(req);
    assert.equal(response.status, 400);
  }
  assert.equal(init, 0);
  assert.equal(callback, 0);
  assert.equal(error, 0);
});
