# Organization User Storage Allowances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce 5 GB per user per organization for Folders assets, display usage, and provide audited organization/Webmaster overrides with a purchase-ready entitlement boundary.

**Architecture:** Shared PostgreSQL owns quota accounts, batch reservations and object charges; accounting joins the existing Google receipt transactions. Members owns shared schema and the quota administration backend. DAM and Members share identical accounting modules; Webmaster forwards authorized administrator operations through an authenticated server-to-server boundary.

**Tech Stack:** Existing Next.js, TypeScript, PostgreSQL/pg, Drizzle, Google Cloud Storage, Node test runner and GCP Linux CI.

**Spec:** `../specs/2026-10-01-organization-user-storage-design.md` (approved 2026-10-01).

## Global Constraints

- Default base: 5,000,000,000 bytes per user per organization; GB is 1,000,000,000 bytes.
- Effective capacity is base plus active purchased bytes; administrators edit base only.
- Lowering capacity never deletes files; already-admitted reservations remain valid.
- Byte counters are bigint; API/JSON byte values are decimal strings.
- Organization owners/admins and platform superadmins may override; managers/members may not.
- Current shared source database remains authoritative until the independent coordinated migration.
- No invented prices, real test purchases, customer quota edits or customer file deletion.
- Enforcement flags begin disabled; existing UploadThing callback draining remains functional.
- Implementation uses isolated worktrees for DAM, Members and Webmaster; read each repository's AGENTS.md and applicable local Next.js documentation before code changes.

## Review Focus

- Repeated batch initiation after a dropped response must not accumulate invisible permanent reservations: expiration/cancel must be bounded and observable (Task 2).
- Removing an organization membership must stop renewal/completion even for a valid earlier receipt (Task 3).
- Duplicate asset rows can reference one object: removing the original must neither double-charge nor prematurely release the object (Task 4).
- Webmaster's separate administrator identity must not be mistaken for a shared-platform user ID or permit browser-forged overrides (Task 5).
- Missing or invalid commercial configuration must leave quota controls usable and purchases honestly unavailable (Task 6).

## File Structure and Shared Interfaces

Repository roots: DAM `/Users/admin/Developer/_gcp/dam.axxes.club`, Members `/Users/admin/Developer/_gcp/members.axxes.club`, Webmaster `/Users/admin/Developer/webmaster`.

Members owns `src/lib/storage/{types.ts,quota.mjs,quota.d.mts,authorization.ts,service.ts,billing-catalog.ts}` and `src/lib/db/schema/storage.ts`. Copy the database-independent quota module and declaration byte-for-byte into DAM `src/lib/storage/`; a parity check pins both copies. DAM's shared schema mapping lives in `src/lib/db/schema.ts`. Avoid a new published package in this release.

`StorageKey = { tenantId: string; userId: string }`. `StorageSnapshot = { baseBytes: string; paidBytes: string; usedBytes: string; reservedBytes: string; effectiveBytes: string; remainingBytes: string; legacyBytes: string }`. `QuotaActor = { kind: 'member' | 'platform' | 'webmaster'; id: string }`; actors are constructed only by authenticated server handlers.

`readStorage(pool, key): Promise<StorageSnapshot>`; `reserveBatch(client, {key, records, enforce, now}): Promise<void>`; `commitCharge(client, {uploadId, assetId, objectKey, generation, actualBytes, now}): Promise<void>`; `expireReservations(client, now): Promise<number>`; `releaseObjectCharge(client, {objectKey,generation}): Promise<boolean>`; `setBaseAllowance(pool, {actor,key,baseBytes,reason}): Promise<StorageSnapshot>`.

Quota methods accept `pg.PoolClient` for mutations already inside a transaction; they do not nest BEGIN/COMMIT. API inputs validate decimal bytes with a finite ceiling of PostgreSQL signed bigint; reject negatives, fractions, exponent notation, unsafe JS numbers and empty reasons. Account creation is idempotent. Locks use a consistent account-before-reservation order in initiation, completion and expiry.

### Task 1: Shared schema, numeric boundary and allowance snapshots

**Files:** Members `src/lib/db/schema/storage.ts`, `src/lib/db/schema/index.ts`, `drizzle/0005_storage_allowances.sql`, `scripts/storage/schema.check.mjs`; both apps `src/lib/storage/{types.ts,quota.mjs,quota.d.mts}`; DAM `src/lib/db/schema.ts`.

**Interfaces:** Produce StorageKey/StorageSnapshot and `readStorage`; create tables `storage_accounts`, `storage_reservations`, `storage_object_charges`, `storage_asset_links`, `storage_entitlements`, `storage_billing_events`, `storage_override_audit`.

- [ ] Write failing schema/numeric tests: a new account reports base/effective `5000000000`, used/reserved `0`; two organizations are independent; values above Number.MAX_SAFE_INTEGER round-trip as strings; all negative/fractional counters fail constraints.
- [ ] Run `node --test scripts/storage/schema.check.mjs` in Members; confirm failure before implementation.
- [ ] Implement additive migration with unique account pair, upload ID, object generation, asset link and provider-event ID; nonnegative counters and reservation state constraints. Charges retain owner attribution independently of asset-row deletion. Match actual migration journal conventions rather than blindly invoking a whole-schema push.
- [ ] Implement types/numeric validation/readStorage and DAM mappings; export through Members schema index. Test migration twice against disposable PostgreSQL with existing unrelated data; second application must be harmless.
- [ ] Run schema tests and each app's `npx tsc --noEmit`; commit only task files in each repository.

### Task 2: Atomic batch reservation and bounded cleanup

**Files:** Both apps `src/lib/storage/quota.mjs`, `src/lib/gcs/{core.mjs,core.d.mts,postgres-registry.mjs,postgres-registry.d.mts}`, `scripts/storage/reservations.check.mjs`; Members `src/app/api/cron/storage/route.ts`.

**Interfaces:** Produce `reserveBatch` and `expireReservations`; extend registry with `createBatch(records)` that inserts all receipts and quota reservations in one SQL transaction. Keep default generic behavior quota-free for non-Folders routes.

- [ ] Write failing real-PostgreSQL tests: two concurrent 3 GB reservations against 5 GB admit exactly one; 4 GB + 2 GB in one batch admits none; injected receipt insert failure leaves no receipts/reservations; expiry twice releases once; repeated abandoned requests eventually release all reserved bytes.
- [ ] Run `node --test scripts/storage/reservations.check.mjs`; confirm red.
- [ ] Refactor init to build all records then call createBatch before signing any policy. Resolve charging key from trusted route metadata only. Reserve until the receipt's absolute 24-hour deadline. Signing failure retains bounded, observable reservations or releases the entire batch safely; no policies exist for rejected batches.
- [ ] Implement cancellation as owner-authenticated batch release with no completed charge release. Implement cron expiry using the existing cron authentication and account-first lock order; add quota error JSON (`code: storage_limit_exceeded`, decimal snapshot and requestedBytes) and browser handling without disrupting current errors.
- [ ] Run tests, existing `npm run test:storage` in DAM and `pnpm test:storage` in Members; commit.

### Task 3: Upload attribution and receipt completion accounting

**Files:** Both `src/app/api/uploadthing/core.ts`, `src/lib/gcs/{core.mjs,postgres-registry.mjs}`, quota module; DAM `src/lib/upload-session.ts`; both `scripts/storage/completion.check.mjs`.

**Interfaces:** Consume reserveBatch; produce commitCharge. Extend callback result linking via returned serverData.assetId; charged owner is recorded in object-charge ledger, not guessed from asset row.

- [ ] Write failing tests: normal uploads charge authenticated user; handoff charges persisted createdById; request-supplied user/tenant cannot replace it; replay charges exactly once; callback failure leaves reservation intact; renewal reserves no extra bytes; removed membership denies renewal/completion; admitted reservation still completes after base reduction.
- [ ] Run completion tests; confirm red.
- [ ] Add handoff attribution to stable authorization metadata, checking creator membership and current upload-session validity each phase. For Members damUploader use its existing tenant context. Metadata remains stable across replay.
- [ ] Integrate completion accounting with callback/receipt transaction after verified actual size, atomically creating charge and asset link and moving reserved to used. Check deadline/reservation ownership; roll back receipt, asset and counter together on failure. Preserve same-ID replay after successful commit without recharging.
- [ ] Verify staged object-size mismatch rejects without charge; run completion and all existing storage tests in both apps, typecheck, commit.

### Task 4: Object reference lifecycle, duplication and legacy reconciliation

**Files:** DAM `src/lib/api.ts`, `src/app/api/assets/[id]/duplicate/route.ts`, `src/app/api/assets/[id]/route.ts`, `src/app/api/assets/bulk/route.ts`; Members `src/lib/actions/assets.ts`, `src/app/api/dam/assets/route.ts`; both quota modules and `scripts/storage/lifecycle.check.mjs`; Members `scripts/storage/backfill.mjs`.

**Interfaces:** Consume object charges; produce releaseObjectCharge and idempotent reconciliation. Batch delete/import paths must call the same lifecycle functions.

- [ ] Write failing tests: duplicate two asset rows referencing one object charges once; deleting either row preserves charge until last retained reference disappears; permanent delete retry releases once even if object was removed previously; soft-deleted retained bytes remain charged; URL-only row never charges.
- [ ] Run lifecycle tests; confirm red.
- [ ] Link duplicate rows to existing charge without a new owned object. For actual byte copies/imports reserve against their authenticated charging user before creating Google bytes. Enumerate all creation/deletion/import paths through `rg` and document coverage; deny unaccounted physical imports under enforcement rather than permitting a bypass.
- [ ] Permanently remove only proven unreferenced owned generations; release once after object removal with retry reconciliation. Existing imported shared copies are retained according to migration rules. Add backfill dry-run: only completed receipt/local-user/tenant provenance assigns ownership; ambiguous legacy rows remain unassigned. Use verified sizes and group identical retained objects without double-counting.
- [ ] Run dry-run on owned fixtures first, lifecycle tests/typechecks, and commit. Production backfill is a separate rollout step with counts-only output.

### Task 5: Authorized quota API and Webmaster bridge

**Files:** Members `src/lib/storage/{authorization.ts,service.ts}`, `src/app/api/storage/allowance/route.ts`, `src/app/api/storage/members/route.ts`, `src/app/api/internal/storage/route.ts`, `scripts/storage/authorization.check.mjs`; Webmaster `src/lib/storage/client.ts`, `src/app/api/storage/route.ts`, `tests/storage.test.ts`.

**Interfaces:** GET allowance returns own snapshot; GET members lists organization member snapshots for owner/admin or platform administrator; PATCH allowance consumes `{tenantId,userId,baseBytes,reason}`. setBaseAllowance locks account and writes immutable before/after audit in the same transaction.

- [ ] Write failing authorization tests: member cannot edit self/others; manager cannot edit; org admin cannot edit other org; deleted membership and inactive tenant reject; client actor/role fields reject; base reset is exactly 5 GB and paid capacity is preserved; one successful mutation creates exactly one audit.
- [ ] Run authorization tests; confirm red.
- [ ] Implement Members authorization from current membership/superadmin state and CSRF/origin protection on mutations. Do not expose a public bypass by merely setting actor kind.
- [ ] Implement Webmaster forwarding after existing requireAdmin/request guards; Members internal handler verifies Google service identity token's signature, exact audience and allowlisted Webmaster runtime service account. Construct Webmaster actor from authenticated server context; preserve its separate local identity and never treat it as platform User.id. No browser credentials or database passwords are sent to the client.
- [ ] Test forged browser/service tokens, wrong audience/account and password-only/elevation behavior against existing Webmaster security policy; run Members typechecks plus Webmaster's package-defined test/build commands; commit each repo.

### Task 6: Storage meter, member controls and honest purchase entry

**Files:** DAM `src/components/storage/{usage-meter.tsx,member-limits.tsx}`, `src/app/storage/page.tsx`; Members `src/components/storage/{usage-meter.tsx,member-limits.tsx}`, `src/app/(dashboard)/storage/page.tsx`, `src/lib/storage/billing-catalog.ts`; both existing asset-browser and navigation components; Webmaster `src/components/storage-panel.tsx`, `src/components/dashboard.tsx`.

**Interfaces:** Consume Task 5 APIs; catalog reads `{published:false,packages:[]}` until commercial configuration is approved. No payment-enabled environment or price is fabricated.

- [ ] Write failing UI/handler tests for correct decimal GB display, selected organization changes, upload limit error/remaining space, pending bytes, empty usage, over-limit state without file removal, reset/set validation and unavailable purchase state.
- [ ] Run tests using each repository's existing UI harness; if absent, use focused route tests plus existing browser verification instead of introducing an unrelated testing framework.
- [ ] Implement meter and organization member table with distinct base/paid/effective values, reasons and audit display. Add accessible edit/reset actions and reload authoritative snapshots after mutations; surface failures without optimistic fake success. Webmaster uses the server bridge and organization picker.
- [ ] Add Buy more storage entry explaining unavailability until packages are published; create server-owned catalog validation interface with no checkout route granting capacity. Preserve the user's unresolved package/pricing question.
- [ ] Run type/build checks and owned-fixture browser checks for user, org admin and Webmaster; commit.

### Task 7: Linux CI, rollout and billing continuation handoff

**Files:** Both `cloudbuild.yaml`, `scripts/storage/*.check.mjs`; Members `scripts/storage/rollout.mjs`; cutover `data/storage-quota-readiness.json`; this plan checkboxes.

**Interfaces:** `STORAGE_QUOTA_MODE=off|shadow|enforce`; default off. In shadow mode populate counters/reservations but record would-deny instead of rejecting; never mix modes mid-batch or rewrite admitted decisions during retries.

- [ ] Add quota tests to existing Linux CI; require real disposable PostgreSQL concurrency tests and module parity checks, not mocks alone. Preserve existing image security scans and deployment branch deploy/gcp.
- [ ] Verify role/schema/rollout requirements and stage same immutable images for both apps; validate owned nonadmin uploads, aggregate denial, retry and admin reductions without touching customer quotas. Publish counts/status only, never user names, secrets or private files.
- [ ] Apply additive schema to current authority and Google warm target using existing migration access; dry-run attribution/reconciliation then shadow mode. Require zero unexplained accounting divergence and both live entry points ready before enforce. Record serving revisions/flags and safe rollback (disable new admission enforcement; retain receipts/charges and read access).
- [ ] Configure one authenticated expiry scheduler on the active authority, avoiding duplicate writers during the GCP migration. Reverify after final shared cutover and include quota tables in final copy/hash checks.
- [ ] Request whole-change review, fix material findings, rerun only affected checks, and deliver evidence and remaining billing gate. Do not claim paid storage is live.
- [ ] Once package size/price/currency/cadence and legitimate payment access arrive, prepare the separate billing activation plan against the approved spec: server-created order, verified/deduplicated events, subscription or one-time lifecycle matching the commercial choice, effective expiry/refund semantics and no real test charges. Complete purchase capability before marking the original feature finished.

## Self-review and Execution Handoff

Schema/enforcement/lifecycle/admin/UI/rollout requirements map to Tasks 1–7. Paid purchases remain a separate required continuation because the user has not specified packages, cadence or prices and legitimate production payment access is missing; the purchase-unavailable state is not feature completion. Types and quota signatures above are shared across both app implementations. Five Review Focus inputs have named tests in their owning tasks.

Recommend native execution: all tasks depend on shared accounting/transaction interfaces, and serial implementation reduces competing edits across the three repositories. Request plan review and execution-method choice before product code, as required by the writing-plans skill.
