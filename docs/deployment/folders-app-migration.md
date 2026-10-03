# Folders .app migration

Canonical application: `https://folders.axxes.app`. Native bundle ID: `app.axxes.folders`.

DNS currently resolves both Folders names to Google load balancer `136.81.161.193`; changing those records is unnecessary. TLS must be rechecked at cutover.

## Release order

1. Deploy Handshake's exact `folders` OIDC client, configured by `FOLDERS_OIDC_CLIENT_SECRET`.
2. Deploy Folders with the same client secret under `AXXES_OIDC_CLIENT_SECRET`, `AXXES_OIDC_CLIENT_ID=folders`, `FOLDERS_PUBLIC_URL=https://folders.axxes.app`, and the existing Handshake issuer/shared identity database. Keep secrets in Secret Manager. New canonical browser sessions use host-only cookies; existing `.club` sessions remain usable by legacy service requests.
3. Validate `node scripts/folders-domain.mjs --dry-run`, then apply with `--apply`. The script takes a fresh backup, validates Google routing, and includes the original URL-map fingerprint in the update to reject concurrent changes.
4. Verify browser sign-in, the exact callback, protected APIs, uploads, legacy share links with query strings, and the native account/file workflows.

Only the two Folders host rules and their dedicated matchers change. `.app` routes to `dam-be`. `.club` public paths receive a permanent 308 to `.app`, preserving their paths and queries. `/api` and `/api/*` on `.club` continue to the backend so existing server clients and historical authenticated delivery URLs retain compatibility. `dam.axxes.club`, v2 hosts, and unrelated products retain their routes. Historical backing storage URLs are preserved; the mobile client uses authorized delivery rather than those raw URLs.

The product catalog's `folders` URL must also be updated to `.app`; its description should identify personal and business file libraries. Handshake's fallback catalog is updated in source. Record the existing live row before changing it.

## Rollback

The routing script stores the previous full map under ignored `.superpowers/folders-domain/before.json`. Restore only the previous Folders host rules/matchers into a freshly fetched map, retaining all intervening changes and its current fingerprint; validate before updating. Do not blindly import a stale whole-map backup. Restore prior Folders/Handshake revisions and secret version pins if authentication fails. Record revision names and previous public configuration in release evidence, never secret values.

Standalone iPhone installation requires Expo/EAS login, Apple team signing access, device registration, and any phone-side trust or Developer Mode confirmation. An exported JavaScript bundle alone is not an installed app.
