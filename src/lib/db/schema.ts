import { pgTable, text, timestamp, boolean, index, uuid, integer, jsonb, bigint, primaryKey, uniqueIndex } from "drizzle-orm/pg-core"

// Better Auth User table
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  isSuperadmin: boolean("is_superadmin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("user_email_idx").on(table.email),
])

// Better Auth Session table
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [
  index("session_user_idx").on(table.userId),
  index("session_token_idx").on(table.token),
])

// Better Auth Account table (for OAuth providers)
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("account_user_idx").on(table.userId),
])

// Better Auth Verification table (for email verification, password reset, etc.)
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// Types
export type User = typeof user.$inferSelect
export type NewUser = typeof user.$inferInsert
export type Session = typeof session.$inferSelect
export type Account = typeof account.$inferSelect

// Shared AXXES platform tables (owned by the members portal — mapped here, never migrated from this app)
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey(),
  status: text("status").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  settings: jsonb("settings").$type<{ features?: Record<string, boolean> } & Record<string, unknown>>().default({}),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
})

export const tenantMemberships = pgTable("tenant_memberships", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
})

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  ownerUserId: text("owner_user_id"),
  uploadedById: text("uploaded_by_id"),
  appKey: text("app_key"),
  storageKey: text("storage_key"),
  uploadKey: text("upload_key").unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  trashedAt: timestamp("trashed_at", { withTimezone: true }),
  trashReason: text("trash_reason"),
  name: text("name").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  width: integer("width"),
  height: integer("height"),
  folder: text("folder"),
  tags: jsonb("tags").$type<string[]>(),
  category: text("category"),
  source: text("source").default("url"),
  originalFilename: text("original_filename"),
  altText: text("alt_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type AssetRow = typeof assets.$inferSelect

// Handoff Sessions (for QR code camera uploads)
export const uploadSessions = pgTable("upload_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  tenantId: uuid("tenant_id"),
  ownerUserId: text("owner_user_id"),
  folder: text("folder"),
  createdById: text("created_by_id").notNull(),
  photos: jsonb("photos").$type<string[]>().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// ── Links to records in other AXXES apps ───────────────────────────────────
//
// This app owns none of this and runs no migrations against it: the portal
// (members.axxes.club) owns `asset_app_links`, and a product only maps the
// columns it joins on. It exists so a folder can offer "Open in …" for whatever
// a file is attached to, without knowing any other app's schema.

export const assetAppLinks = pgTable("asset_app_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  assetId: uuid("asset_id").notNull(),
  appKey: text("app_key").notNull(),
  recordId: uuid("record_id").notNull(),
});

export const assetFolders = pgTable("asset_folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  libraryId: text("library_id").notNull(),
  tenantId: uuid("tenant_id"),
  ownerUserId: text("owner_user_id"),
  path: text("path").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  trashedAt: timestamp("trashed_at", { withTimezone: true }),
  trashReason: text("trash_reason"),
});
export const folderGrants = pgTable("folder_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  folderId: uuid("folder_id").notNull(),
  recipientUserId: text("recipient_user_id"),
  recipientTenantId: uuid("recipient_tenant_id"),
  canRead: boolean("can_read").notNull().default(true),
  canUpload: boolean("can_upload").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});
export const assetAppGrants = pgTable("asset_app_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id").notNull(),
  appKey: text("app_key").notNull(),
  recordId: uuid("record_id").notNull(),
  audienceTenantId: uuid("audience_tenant_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const foldersUploadIntents = pgTable("folders_upload_intents", {
 id: uuid("id").primaryKey().defaultRandom(), appKey:text("app_key").notNull(), recordId:uuid("record_id").notNull(), audienceTenantId:uuid("audience_tenant_id").notNull(), userId:text("user_id").notNull(), libraryId:text("library_id").notNull(), folder:text("folder"), expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(), assetExpiresAt:timestamp("asset_expires_at",{withTimezone:true}), createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
});

export const assetOwnershipEvents = pgTable("asset_ownership_events", {
 id:uuid("id").primaryKey().defaultRandom(),assetId:uuid("asset_id").notNull(),actorUserId:text("actor_user_id").notNull(),fromTenantId:uuid("from_tenant_id"),fromOwnerUserId:text("from_owner_user_id"),toTenantId:uuid("to_tenant_id"),toOwnerUserId:text("to_owner_user_id"),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
});

export const folderStorageCleanup = pgTable("folder_storage_cleanup", {
 storageKey:text("storage_key").primaryKey(),attempts:integer("attempts").notNull().default(0),lastError:text("last_error"),nextAttemptAt:timestamp("next_attempt_at",{withTimezone:true}).notNull().defaultNow(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
});

export const officeServiceRequests = pgTable("office_service_requests", {
 caller:text("caller").notNull(),requestId:text("request_id").notNull(),expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
}, t=>[primaryKey({columns:[t.caller,t.requestId]})]);
export const officeUploads = pgTable("office_uploads", {
 id:uuid("id").primaryKey().defaultRandom(),requestId:text("request_id").notNull(),userId:text("user_id").notNull(),libraryId:text("library_id").notNull(),folder:text("folder"),name:text("name").notNull(),mimeType:text("mime_type").notNull(),size:bigint("size",{mode:"number"}).notNull(),storageKey:text("storage_key").unique(),assetId:uuid("asset_id"),expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex("office_uploads_user_request_idx").on(t.userId,t.requestId)]);
import {customType} from 'drizzle-orm/pg-core';
const byteString=customType<{data:string;driverData:string}>({dataType(){return 'bigint';}});
export const storageAccounts=pgTable('storage_accounts',{
 tenantId:uuid('tenant_id').notNull(),userId:text('user_id').notNull(),
 baseBytes:byteString('base_bytes').notNull().default('5000000000'),
 usedBytes:byteString('used_bytes').notNull().default('0'),reservedBytes:byteString('reserved_bytes').notNull().default('0'),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()
},t=>[primaryKey({columns:[t.tenantId,t.userId]})]);
