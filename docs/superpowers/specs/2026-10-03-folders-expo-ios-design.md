# Folders for iOS and canonical .app domain

## Outcome

Build Folders as an Expo React Native iOS app for AXXES Personal and Business solutions. Connect to existing AXXES identities and the existing Folders asset service. Preserve live files, ownership, workspace memberships, and server permissions. Make https://folders.axxes.app the canonical public address, track the app in GitHub, and install a signed build on the connected iPhone.

The user selected Expo React Native in place of SwiftUI. Existing-account integration is the recommended assumption pending review of this design.

## Architecture and alternatives

Use a dedicated TypeScript Expo project, Expo Router, and the existing Folders HTTP API. This preserves current data and permissions while providing native screens and system file/photo pickers. A web wrapper would reduce initial work but would not meet the intended native experience. A separate local-only organizer would not serve existing business libraries. Neither alternative is selected.

Keep the mobile client in a private AXXES GitHub repository, provisionally named folders-mobile, with installation and build instructions, dependency lockfile, CI, and EAS configuration. Backend/domain changes belong in their existing repositories. Check repository naming and existence before creating it. Preserve concurrent local changes and isolate implementation work.

## First release

Native navigation exposes Libraries, Search, and Settings. Library selection distinguishes personal, business, and shared destinations using server-provided capabilities. Within a library, show folder navigation and paginated files; support creating folders, uploading files/photos, renaming and moving assets, authorized previews/downloads, native sharing, and Trash/restore where the backend permits them. Surface loading, empty, expired-session, network-failure, and permission-denied states. Disable actions unavailable to the selected role; server authorization remains authoritative.

Use AXXES branding and clear Personal/Business language. Request file/photo permissions when the corresponding action is used. Do not use fabricated files or successful mock operations as production content. Initial scope excludes offline editing, automatic camera backup, billing, and a share extension.

## Authentication and data flow

First verify the deployed backend version and available authentication capabilities against source. Implement a supported native authentication flow with credentials/session material stored in Expo SecureStore and no server secrets in the bundle. Prefer existing supported token authentication; if unavailable, add a narrow native session integration to the backend and test sign-in, expiry, revocation, and sign-out. Do not assume browser cookies automatically transfer to the app or across registrable domains.

Use a typed API adapter for existing library, folder, asset, delivery, upload, and share routes. Carry the authenticated session on every protected request. Use current backend upload authorization and completion protocols; respect storage limits and do not expose storage credentials. Download private files through authorized delivery and clean up temporary preview/share files. Clear private client state on sign-out and account changes.

## Domain migration

Inspect and export the current DNS records, Google load-balancer routing, TLS configuration, Cloud Run settings, and authentication redirect allowlists before changes. Route folders.axxes.app to the Folders backend with valid TLS. Reverse the current alias redirect so folders.axxes.club permanently redirects to the canonical .app host while preserving paths and query strings. Preserve unrelated services and names.

Update Folders public origin, callback URLs, trusted origins, mobile links, and direct consuming-service references where needed. Authenticate browser users through a supported cross-domain redirect/session exchange rather than relying on .club cookies on .app. Verify legacy API consumers and signed callbacks before enabling permanent redirects; migrate incompatible consumers or preserve a narrowly scoped compatibility route. Record concrete changed resources and rollback commands without credentials.

## Verification and delivery

Run TypeScript and Expo configuration/dependency checks, API contract/authentication tests, and meaningful tests for permission handling and library transitions. Verify a production JavaScript bundle. Test sign-in, personal and business browsing, upload, preview, sharing, sign-out, and reconnect on the actual iPhone with authorized test data. Verify TLS, canonical origin, legacy path/query redirects, browser login return URLs, and existing integrations after migration.

Use EAS cloud builds because full Xcode is absent locally. Check available Expo authentication, Apple team access, signing credentials, registered device, and Developer Mode. Produce an internally distributed build that includes its JavaScript bundle and can launch without a running Metro server. Install and launch it on the connected phone, verifying the installed bundle identity. Expo Go is only a preview and does not satisfy standalone installation. If account authentication or on-device confirmation is required, report the precise dependency and request it without claiming installation.

Commit and push the mobile implementation and relevant backend changes to their intended GitHub branches, verify remote tracking and CI, and report repository links, build/install evidence, domain evidence, and any remaining blocker. Do not publish to the App Store as part of this request.
