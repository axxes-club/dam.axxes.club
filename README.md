# AXXES DAM

Digital asset management for AXXES.club workspaces (dam.axxes.club).

## Stack

- Next.js 14 (App Router) + Tailwind + shadcn (base-ui) components
- Better Auth (email/password) sharing the members portal's user/session tables
- Neon Postgres via Drizzle (`src/lib/db`)
- UploadThing for file storage

## Data model

This app reads and writes the **shared platform database** used by members.axxes.club.
It does not own or migrate any tables — `src/lib/db/schema.ts` only maps the ones it uses:

- `assets` — one row per asset, scoped by `tenant_id`. Folders are the free-text `folder` column; tags are a `jsonb` string array.
- `tenants` / `tenant_memberships` — which workspaces a user can see. Superadmins (`user.is_superadmin`) see every workspace.

Roles: `owner`/`admin`/`manager` can edit and delete, `member` can upload and edit, `viewer` is read-only.
Deleting an asset uploaded through the DAM (`source = 'upload'`) also deletes the file from UploadThing.

## Development

Required env (`.env.local`): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `UPLOADTHING_TOKEN`.

```bash
npm install
npm run dev
```
