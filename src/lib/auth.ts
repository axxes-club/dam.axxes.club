import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";

// With Handshake (handshake.axxes.club), every *.axxes.club app shares one session cookie
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;
const parent = (cookieDomain || "axxes.club").replace(/^\./, "");

// Sign-in works from AXXES domains and the project's own Vercel URLs
const trustedOrigins = [
  `https://${parent}`,
  `https://*.${parent}`,
  ...(process.env.NODE_ENV !== "production" ? [`http://*.${parent}:*`] : []),
  process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
  process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
].filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
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
