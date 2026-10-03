# Folders Expo iOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver a native Expo Folders app backed by existing AXXES libraries, move its canonical domain to folders.axxes.app, and install a signed build on the connected iPhone.

**Architecture:** A separate TypeScript mobile repository consumes the existing Folders HTTP API. Better Auth's Expo integration stores native session cookies in SecureStore; browser sign-in uses a validated Handshake OIDC flow for the cross-domain migration. Backend source changes and Google load-balancer changes are staged and verified before reversing the legacy redirect.

**Tech Stack:** Expo React Native, Expo Router, TypeScript, Better Auth, SecureStore, TanStack Query, Expo document/image pickers, file system and sharing, EAS Build; existing Next.js/Postgres/GCS backend and Google Cloud load balancer.

**Spec:** `docs/superpowers/specs/2026-10-03-folders-expo-ios-design.md`

## Global Constraints

- Connect to existing AXXES identities and the existing Folders asset service.
- Preserve live files, ownership, workspace memberships, and server permissions.
- Make https://folders.axxes.app the canonical public address.
- Expo Go is only a preview and does not satisfy standalone installation.
- Do not use fabricated files or successful mock operations as production content.
- Do not publish to the App Store as part of this request.
- Keep server secrets out of the mobile bundle and GitHub. Preserve concurrent local changes.

## Review Focus

- A late response after changing libraries or signing out must never display the previous library's data.
- A shared-folder user must remain within the server-provided folder scope, including search and pagination.
- Expired/revoked sessions and denied roles must fail clearly without retrying mutations or exposing cached private files.
- Failed/cancelled uploads must not be represented as completed; quota rejection must retain useful feedback.
- Cross-domain sign-in and legacy links must preserve valid destinations while rejecting untrusted redirects.

## Plan A: Mobile app

### Task 1: Verified backend contract and native authentication

**Files:** Mobile `src/api/contracts.ts`, `src/api/client.ts`, `src/auth/client.ts`, `src/auth/provider.tsx`, `tests/api.test.ts`, `tests/session.test.ts`, `app.config.ts`, `eas.json`, `package.json`; backend `src/lib/auth.ts`, `tests/native-auth.test.ts`, dependency lockfile.

**Interfaces:** `FoldersClient.request<T>(path: string, options?: RequestInit): Promise<T>`; `Library {id,name,role,folder?,canWrite,canDelete}`; `AssetPage {assets,total,nextOffset}` matching backend `src/lib/types.ts`. `useAuth()` exposes session, pending state, signIn(email,password), and signOut().

- [ ] Inspect current remote main and deployed Cloud Run revision; reconcile local branches before choosing implementation base. Confirm `/api/libraries`, `/api/folders`, `/api/assets`, `/api/storage`, and `/api/auth/get-session` shapes from current source. Export credential-free deployment metadata.
- [ ] Create the separate mobile checkout, selecting current stable Expo SDK and its matching React Native versions using Expo tooling. Configure bundle ID `app.axxes.folders`, scheme `axxes-folders`, name `Folders`, and fixed production API origin `https://folders.axxes.app`. Configure preview as internal distribution with a bundled release, not a Metro-dependent development client.
- [ ] Write tests asserting protected requests carry the native session Cookie, 401 clears private state, 403 preserves authentication but reports denial, and no mutation retries occur. Run tests and confirm failure before implementation.
- [ ] Implement Better Auth Expo client with SecureStore and matching server plugin/version. Add exact mobile trusted origin and preserve existing valid web clients. Implement native email/password sign-in against existing identities; no registration or new identity database.
- [ ] Run mobile tests/typecheck and backend authentication checks. Verify unauthenticated APIs return 401. Commit app setup/authentication and backend changes separately.

### Task 2: Libraries, folder navigation, search, and lifecycle

**Files:** Mobile `app/_layout.tsx`, `app/sign-in.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/search.tsx`, `app/(tabs)/settings.tsx`, `app/library/[id].tsx`, `src/features/library/queries.ts`, `src/features/library/scope.ts`, `src/components/AssetRow.tsx`, `src/components/FolderRow.tsx`, `src/components/ScreenState.tsx`, `src/theme.ts`, `tests/library.test.ts`.

**Interfaces:** `libraryQueryKey(userId,libraryId,folder,query,trash)` uniquely scopes cached data. `folderWithinScope(path: string|null, root: string|null): boolean` prevents navigating above a shared root. `assetActions(library: Library, trash: boolean)` returns the server-capability-derived available actions.

- [ ] Write tests asserting separate cache keys for accounts/libraries/search/Trash, rejection of shared-scope traversal, and viewer/shared roles cannot access mutation/lifecycle controls. Verify tests fail.
- [ ] Implement native branded tabs and sign-in, library selector, folder breadcrumbs, paginated asset lists, search, pull-to-refresh, and explicit loading/empty/error states. Cancel old requests and clear all private query state on sign-out.
- [ ] Wire create/rename folder and rename/move asset to existing POST/PATCH endpoints. Trash uses DELETE without permanent deletion; restore uses PATCH `{restore:true}` and only permitted roles. Confirm destructive actions and refresh after successful mutations.
- [ ] Run tests/typecheck and verify export compilation; commit the browsing/lifecycle deliverable.

### Task 3: Upload, protected preview, download, and sharing

**Files:** Mobile `src/features/files/upload.ts`, `src/features/files/delivery.ts`, `src/features/files/permissions.ts`, `app/asset/[id].tsx`, `src/components/UploadSheet.tsx`, `src/components/UploadProgress.tsx`, `tests/upload.test.ts`, `tests/delivery.test.ts`.

**Interfaces:** `uploadFile(file: {uri,name,mimeType,size}, library: Library, folder: string|null, signal: AbortSignal): Promise<Asset>`; `downloadAsset(asset: Asset): Promise<string>` returns a temporary authorized local URI; `shareAssetLink(libraryId: string, assetId: string, days: 1|7|30|365): Promise<string>` uses `/api/share`.

- [ ] Write tests asserting cancelled upload never sends completion, 403/quota failure is visible, delivery uses protected endpoint, and external hosts never receive AXXES session credentials. Confirm failure.
- [ ] Implement system file/photo selection with action-time permissions. Use current GCS `/api/storage` init/renew/complete protocol with RN multipart signed upload; if production has not enabled GCS, use its existing UploadThing protocol through an isolated adapter rather than switching storage providers. Apply quota errors and completion checks before updating lists.
- [ ] Implement image preview and local file preview/opening with authenticated downloads; use native sharing for downloaded files and expiring public links for explicit link sharing. Clean temporary private files on sign-out, account change, and completed preview lifecycle.
- [ ] Run unit tests, typecheck, Expo dependency/configuration checks, and production iOS bundle export. Commit the complete native file workflow.

## Plan B: Canonical domain and delivery

### Task 4: Browser authentication and migration compatibility

**Files:** Backend `src/lib/auth.ts`, `src/lib/folders-oidc.ts`, `src/lib/folders-oidc-session.ts`, `src/app/api/auth/axxes/start/route.ts`, `src/app/api/auth/axxes/callback/route.ts`, `src/app/sign-in/page.tsx`, `src/app/sign-out/route.ts`, `src/lib/gcs/server.ts`, `tests/folders-oidc.test.ts`; Handshake `src/lib/oidc.ts` and its client tests; backend `docs/deployment.md`.

**Interfaces:** Server-only `beginFoldersLogin(returnPath: string)` creates state/PKCE and exact callback `https://folders.axxes.app/api/auth/axxes/callback`; `completeFoldersLogin(request: Request)` validates state, verifier, issuer/audience, and existing subject before creating the local existing-user session. Reuse the established Office OIDC primitives and session pattern where compatible, keeping Folders cookie handling explicit.

- [ ] Write tests rejecting untrusted return URLs, mismatched/expired state, reused callback state, invalid issuer/audience, and unknown identity mapping. Confirm failure.
- [ ] Register exact Handshake client `folders` with server-only secret and callback allowlist. Implement browser SSO without relying on .club cookies being available on .app. Preserve central identity and membership checks.
- [ ] Add `.app` origin to storage delivery/callback aliases while retaining historical URLs. Identify direct service consumers, upload callbacks, and shared grants; update references or retain scoped API compatibility before redirecting `.club` traffic.
- [ ] Run authentication/storage/integration tests and production backend build. Verify a staged signed-in browser round trip before canonical cutover. Commit backend changes and consumer updates.

### Task 5: DNS, TLS, routing, and production deployment

**Files:** Backend `scripts/folders-domain.mjs`, `tests/folders-domain.test.mjs`, `docs/deployment/folders-app-migration.md`; external Google Cloud URL map `axxes-lb`, Folders service configuration, relevant DNS records.

**Interfaces:** Pure `patchFoldersRouting(currentMap)` changes only Folders host rules/matchers and retains unrelated entries/fingerprint. Script supports dry-run and explicit apply, exports before/after configuration, and validates planned Google URL-map configuration before import.

- [ ] Export current relevant DNS, TLS/certificate status, URL map and nonsecret service settings. Existing evidence: `folders.axxes.app` uses `folders-app-redirect` to `.club`; `folders.axxes.club` belongs to `dam-matcher`. Verify fresh state rather than assuming this remains current.
- [ ] Write routing tests asserting `.app` uses `dam-be`, `.club` redirects 308 to `.app` with query/path intact, and every unrelated rule remains identical. Confirm failure then implement patch script.
- [ ] Deploy verified backend/authentication changes through existing production delivery. Set canonical public URL/origin, trusted origins and callback configuration. Ensure `.app` DNS resolves to the intended load balancer with valid TLS; change records only if evidence requires it.
- [ ] Apply Folders routing from fresh exported state after validating it. Check `/`, sign-in, protected APIs, legacy `/share/...` and encoded path/query links, browser SSO, uploads and existing consumers. Roll back the Folders-specific changes if authenticated smoke checks fail.
- [ ] Record exact resources/revisions and rollback instructions without secrets. Commit migration code and evidence.

### Task 6: GitHub CI, EAS build, and connected iPhone acceptance

**Files:** Mobile `.github/workflows/ci.yml`, `README.md`, `docs/device-install.md`, `docs/acceptance.md`; mobile/backend plan checkboxes.

**Interfaces:** CI runs clean install, tests, typecheck, Expo checks, and bundled iOS export. Acceptance evidence identifies commit, EAS build, signed bundle ID, actual device installation/launch, and production API origin.

- [ ] Create private `axxes-club/folders-mobile` if absent, configure remote tracking, push implementation, and verify GitHub CI. Track backend changes in its existing repository; avoid accidentally deploying unrelated changes.
- [ ] Inspect Expo/EAS login and Apple team access. Register connected iPhone UDID `00008120-000E3DE02EF0E01E` only after reconfirming it. Request account login or phone trust/Developer Mode interaction if required; never request secrets in chat.
- [ ] Build EAS preview for iOS with internal distribution and embedded production bundle. Install downloaded signed IPA with available device tools or Expo installation link; verify installed `app.axxes.folders` and launch it.
- [ ] On the phone, verify existing-account login, personal and business browsing, scoped shared library, a small authorized test upload, preview/download, sharing, Trash/restore where allowed, sign-out, expiry and reconnect. Clean only test artifacts created for these checks.
- [ ] Run final clean verification and inspect diffs for secrets. Obtain the selected execution method's independent code review, resolve material findings, and report GitHub/build links, live `.app` routing, and installation evidence. If signing or phone interaction prevents installation, state the exact outstanding dependency; do not mark this task complete.
