import { pgTable, text, timestamp, boolean, index, uuid, integer, jsonb } from "drizzle-orm/pg-core"

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
  tenantId: uuid("tenant_id").notNull(),
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
  tenantId: uuid("tenant_id").notNull(),
  folder: text("folder"),
  createdById: text("created_by_id").notNull(),
  photos: jsonb("photos").$type<string[]>().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
