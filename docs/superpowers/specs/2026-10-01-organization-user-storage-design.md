# Folders storage allowances and paid upgrades

Status: design for review; implementation has not started.

## Intent and agreed requirements

Each user receives 5 GB separately in each organization. Users can see usage and buy extra capacity. Organization owners/admins can adjust members' allowances in their own organization; AXXES webmasters can adjust allowances across organizations. Changes are audited. Concurrent uploads cannot bypass limits. Reducing capacity below usage never deletes files; it blocks additional uploads.

The user approved these recommendations on 2026-10-01. This document makes the architecture and rollout concrete for review.

## Scope and alternatives

Use the existing shared PostgreSQL database and Google upload receipt transaction for accounting. This avoids a second authority and permits atomic reservations and completion. A separate quota service would introduce distributed transaction failures; summing assets on every request would not safely reserve space across concurrent uploads. Neither alternative is selected.

Enforce on Folders/DAM and Members' shared asset upload entry points, including phone handoffs and any server import/copy operation that creates a new owned stored asset. Other products' unrelated media policies are outside this change. They must not consume this allowance without an explicit product decision. Cross-product views of the same asset do not create another charge.

## Allowance and permissions

Define GB as 1,000,000,000 bytes, displayed consistently. The default base allowance is 5,000,000,000 bytes. Effective capacity equals the configured base allowance (default 5 GB) plus active purchased extra bytes. Admins edit the base allowance; purchased capacity remains separately visible and cannot silently be removed by an admin override. Reset restores the default base. No unlimited toggle is introduced.

Authorize using current server-side membership and the existing database superadmin flag. Only organization owner/admin roles may edit within that organization; manager/member upload rights do not imply quota administration. Validate the target membership and tenant status. Every override records actor, target user, organization, previous/new base, reason and timestamp. Ordinary users can view only their own allowance and buy for themselves within their selected organization. Client-supplied roles, price amounts and purchase byte counts are never authoritative.

## Attribution and existing assets

Introduce explicit charging-user attribution for new assets. Normal uploads use the authenticated local user ID. Handoffs use the session's persisted createdById, never the anonymous phone's identity. Sharing, viewing and linking an asset do not move ownership or charge recipients.

Existing asset rows lack uploader attribution. Recover ownership only from trustworthy completed upload receipts or other recorded provenance. Remaining legacy assets stay organization-owned and visible as legacy usage; do not arbitrarily charge them to an admin or member. This rollout therefore enforces attributable personal usage and reports unattributed legacy usage separately. Imported URLs with no stored bytes do not consume quota; importing bytes into a new personally owned asset does. Recovered legacy sizes must use verified object metadata, not untrusted request values.

## Data and atomic enforcement

Add shared-schema tables for organization/user storage accounts, upload reservations, asset charges, paid entitlements, billing event receipts and override audit events. Byte counters use PostgreSQL bigint; JSON/API values use decimal strings to avoid precision loss. Unique organization/user keys and upload/asset/provider-event keys enforce idempotence. Shared schema ownership remains with Members; DAM maps those tables and does not independently migrate platform tables.

At batch initialization, authenticate, derive organization and charging user, then lock the quota account and reserve the entire validated batch before issuing any upload policies. Reject the entire batch if used plus outstanding reservations plus requested bytes exceeds effective capacity. Registry creation and reservations must commit together, so partial initiation cannot issue unaccounted policies. If signing fails after reservation, release or let the bounded reservation expire. Return a structured storage_limit_exceeded error with usage, pending bytes, capacity and requested bytes.

Reserve for the receipt's absolute upload deadline. Renewal does not add another reservation. Completion verifies actual object size and atomically moves reserved bytes to used bytes alongside asset creation and the existing receipt result. Completion replay cannot double charge. Reservations already admitted remain valid if an administrator lowers the base; lowering blocks new reservations. Explicit cancellation and expiry release reserved bytes idempotently. Staging lifecycle deletion is not the quota clock. A scheduled reconciliation job expires reservations and detects accounting divergence.

Charge live/restorable retained assets. Deleting a view or link to an asset does not release quota while the shared owned object remains retained. Release the charge exactly once when the owned asset is permanently removed and its application references no longer retain it. Soft-deleted recoverable files remain charged until permanent removal. Retries must safely reconcile object deletion and database accounting, including missing objects after successful prior deletion.

## Billing

Keep a server-owned catalog of extra-capacity packages with organization-scoped purchase attribution. Package sizes, prices, currency and billing cadence need the user's commercial decision. Do not invent prices or publish purchasable packages before that decision. The catalog remains unpublished and checkout unavailable until configured; quota and admin controls can roll out independently.

Existing Tollbooth code implements one-time payments, not a recurring storage entitlement lifecycle. Reuse the payment integration patterns, but treat recurring billing as an explicit additional adapter/lifecycle if monthly or annual packages are selected. A verified provider event, matched to a server-created order and expected payer/organization/package, grants capacity; checkout return URLs never grant capacity. Deduplicate webhook events and handle delayed/out-of-order events against authoritative purchase/subscription state. Define entitlement expiry in the order. Refund/cancellation ends future paid capacity according to the selected billing contract; reducing effective capacity blocks new uploads while retaining data. Production payment activation requires the missing legitimate payment credentials from the ongoing migration.

## User interfaces

Folders shows current organization, used/capacity, pending upload bytes, remaining capacity, and Buy more storage. The purchase screen displays package, price, cadence, effective period and the organization receiving capacity before checkout. Until packages are published, show an honest unavailable state rather than a checkout that cannot work.

Organization administration lists members with usage, base, paid extra and effective capacity, plus set/reset allowance and audit history. Webmaster administration uses the same authorized backend and includes organization selection. Reuse current navigation and table patterns; do not expand Webmaster into unrelated cloud controls within this work.

## Rollout and verification

Add schema and accounting behind flags; backfill only provable attribution and run shadow reconciliation first. Cover both shared upload entry points before enabling enforcement, so Members cannot bypass Folders. Preserve current source database authority until the separately coordinated Cloud SQL cutover; do not flip database URLs or fence shared writers for this feature. The shared final database dump must include the additive schema and accounting records.

Required tests cover simultaneous uploads at the boundary, batch all-or-none reservations, partial signing failure, renew/completion replay, expiry/cancel, verified-size mismatches, handoff attribution, cross-organization privilege denial, admin reduction with admitted uploads, shared/restorable deletion, billing forgery/replay/order variation, refunds/expiry, and attribution reconciliation. Verify in existing Linux GCP CI and perform owned-fixture production checks before enabling. Do not create real charges, modify customer quotas, or delete customer files during verification.

## Remaining decisions and handoff

Confirm package sizes, prices, currency and cadence before enabling sales. Review this written design before creating the implementation plan. That plan should separately deliver accounting/enforcement, user/admin interfaces, and the billing adapter so unresolved payment access does not stall the quota controls.
