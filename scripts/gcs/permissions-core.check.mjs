import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesShare,
  tenantCanRead,
  eventPhotoCanRead,
} from "../../src/lib/gcs/permissions-core.mjs";
test("signed share target cannot cross tenant/asset/folder boundaries", () => {
  const a = { id: "a", tenantId: "t", folder: "Photos" };
  assert.equal(matchesShare({ k: "asset", t: "t", id: "a" }, a), true);
  assert.equal(matchesShare({ k: "asset", t: "other", id: "a" }, a), false);
  assert.equal(matchesShare({ k: "folder", t: "t", f: "Other" }, a), false);
  assert.equal(matchesShare({ k: "folder", t: "t", f: "Photos" }, a), true);
});
test("tenant read and pending photo access remain scoped", () => {
  assert.equal(tenantCanRead({ tenants: [{ id: "t" }] }, "other"), false);
  assert.equal(tenantCanRead({ tenants: [{ id: "t" }] }, "t"), true);
  assert.equal(
    eventPhotoCanRead(
      { canView: true, organizer: false, guestId: "g" },
      "pending",
      "other",
    ),
    false,
  );
  assert.equal(
    eventPhotoCanRead(
      { canView: true, organizer: false, guestId: "g" },
      "pending",
      "g",
    ),
    true,
  );
  assert.equal(
    eventPhotoCanRead(
      { canView: false, organizer: false, guestId: "g" },
      "live",
      "g",
    ),
    false,
  );
  assert.equal(
    eventPhotoCanRead({ canView: true, organizer: true }, "pending", "other"),
    true,
  );
});
