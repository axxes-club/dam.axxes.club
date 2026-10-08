import {APIError} from 'better-auth/api';
import {guardAccountAuth,assertActiveAccount} from '@/lib/security/admission-server';
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

const signingSecret=process.env.BETTER_AUTH_SECRET;
if(process.env.NODE_ENV === "production" && (!signingSecret || signingSecret.length<32))throw new Error("Production authentication secret is not configured");
const baseAuth = betterAuth({
  baseURL: AUTH_ORIGIN,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  // Shared identity enrollment is controlled by Handshake invite creation.
  databaseHooks:{session:{create:{before:async(session)=>{try{await assertActiveAccount(session.userId);}catch{throw new APIError('FORBIDDEN',{message:'Account access is unavailable.'});}return {data:session};}}}},
  disabledPaths: ["/sign-up/email"],
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins,
  advanced: cookieDomain ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } } : undefined,
  secret: signingSecret || "local-development-placeholder-secret-only",
});

// Central AXXES sign-in; when unset the app uses its own sign-in page
export const HANDSHAKE_URL = process.env.HANDSHAKE_URL?.replace(/\/$/, "") || null;

export const auth=guardAccountAuth(baseAuth);
