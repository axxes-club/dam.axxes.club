import assert from "node:assert/strict";
import { test } from "node:test";
import { lifecycleStatus, expirationValue } from "./lifecycle";
test("trash takes precedence over expiry and retains reason", () => {
  assert.equal(
    lifecycleStatus(
      {
        trashedAt: "2026-01-01",
        trashReason: "expired",
        expiresAt: "2025-01-01",
      },
      Date.parse("2026-02-01"),
    ),
    "In Trash · expired",
  );
});
test("expiry is effective at its exact boundary", () => {
  assert.equal(
    lifecycleStatus(
      { expiresAt: "2026-01-01T00:00:00Z" },
      Date.parse("2026-01-01T00:00:00Z"),
    ),
    "Expired",
  );
  assert.equal(lifecycleStatus({ expiresAt: null }, 0), "No expiration");
});
test("blank expiration removes a schedule and invalid input is rejected", () => {
  assert.equal(expirationValue(""), null);
  assert.throws(() => expirationValue("garbage"));
  assert.equal(
    expirationValue("2026-01-01T12:00"),
    new Date("2026-01-01T12:00").toISOString(),
  );
});

test("external links only render HTTP URLs; hosted assets always use protected delivery", async () => {
  const { assetDisplayUrl } = await import("../../lib/assets");
  assert.equal(
    assetDisplayUrl({
      id: "a",
      source: "url",
      storageKey: null,
      url: "https://images.example.com/a.jpg",
    }),
    "https://images.example.com/a.jpg",
  );
  assert.equal(
    assetDisplayUrl({
      id: "a",
      source: "url",
      storageKey: null,
      url: "javascript:alert(1)",
    }),
    "/api/assets/a/delivery",
  );
  assert.equal(
    assetDisplayUrl({
      id: "a",
      source: "upload",
      storageKey: "key",
      url: "https://cdn.example.com/a.jpg",
    }),
    "/api/assets/a/delivery",
  );
});

test("metadata updates omit lifecycle fields unless the owner changes expiration", async () => {
  const { expirationPatch } = await import("./lifecycle");
  assert.deepEqual(
    expirationPatch("2026-10-01T12:00", "2026-10-01T12:00", true),
    {},
  );
  assert.deepEqual(expirationPatch("2026-10-01T12:00", "", false), {});
  assert.deepEqual(expirationPatch("2026-10-01T12:00", "", true), {
    expiresAt: null,
  });
});
test("inherited effective expiration drives display even without an own deadline", () => {
  assert.equal(
    lifecycleStatus(
      { expiresAt: null, effectiveExpiresAt: "2026-01-01T00:00:00Z" },
      Date.parse("2026-02-01"),
    ),
    "Expired",
  );
});

test("unavailable ancestor folder blocks restoring descendants until folder recovery", async () => {
  const { blockingFolder } = await import("./lifecycle");
  const policies = [
    { path: "/Shared", expiresAt: "2025-01-01", trashedAt: null },
    { path: "/Other", expiresAt: null, trashedAt: "2026-01-01" },
  ];
  assert.equal(
    blockingFolder("/Shared/sub", policies, Date.parse("2026-02-01"))?.path,
    "/Shared",
  );
  assert.equal(
    blockingFolder("/Shared-not-a-child", policies, Date.parse("2026-02-01")),
    undefined,
  );
});
