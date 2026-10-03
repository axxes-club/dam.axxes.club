import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { foldersAuthConfig } from './folders-auth-config';

// With Handshake (handshake.axxes.club), every *.axxes.club app shares one session cookie
const settings = foldersAuthConfig(process.env);
const cookieDomain = settings.cookieDomain;
export const AUTH_ORIGIN = settings.baseURL;

// Sign-in works from AXXES domains and the project's own Vercel URLs
const trustedOrigins = settings.trustedOrigins;

export const auth = betterAuth({
  baseURL: AUTH_ORIGIN,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins,
  advanced: cookieDomain ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } } : undefined,
  secret: process.env.BETTER_AUTH_SECRET || "dummy-secret-for-build",
});

// Central AXXES sign-in; when unset the app uses its own sign-in page
export const HANDSHAKE_URL = process.env.HANDSHAKE_URL?.replace(/\/$/, "") || null;
