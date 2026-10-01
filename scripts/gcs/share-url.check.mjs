import { test } from "node:test";
import assert from "node:assert/strict";
import { shareProxyUrl } from "../../src/lib/gcs/share-url.mjs";
const options = {
  origin: "https://dam.axxes.club",
  trustedOrigins: [
    "https://dam.axxes.club",
    "https://members.axxes.club",
    "https://vibez.axxes.club",
  ],
};
test("share capability goes only to exact trusted GCS app proxy with contained key", () => {
  for (const raw of [
    "https://evil.invalid/api/assets/gcp?key=uploads%2Fa",
    "https://dam.axxes.club.evil.invalid/api/assets/gcp?key=uploads%2Fa",
    "http://dam.axxes.club/api/assets/gcp?key=uploads%2Fa",
    "https://dam.axxes.club/api/assets/gcp?key=uploads%2F..%2Fother",
  ])
    assert.equal(shareProxyUrl(raw, "synthetic-share", options), raw);
  assert.equal(shareProxyUrl(null, "synthetic-share", options), null);
});
test("cross-app shared library URL is served through sharing app verifier", () => {
  const url = new URL(
    shareProxyUrl(
      "https://members.axxes.club/api/assets/gcp?key=uploads%2Fmembers%2Fowner%2Fid",
      "synthetic-share",
      options,
    ),
  );
  assert.equal(url.origin, options.origin);
  assert.equal(url.searchParams.get("share"), "synthetic-share");
  assert.equal(url.searchParams.get("key"), "uploads/members/owner/id");
});
