import test from 'node:test';
import assert from 'node:assert/strict';
import { foldersAuthConfig } from './folders-auth-config';
test('the canonical .app origin never issues a .club domain cookie',()=>{
 const config=foldersAuthConfig({AUTH_COOKIE_DOMAIN:'axxes.club'});
 assert.equal(config.baseURL,'https://folders.axxes.app');assert.equal(config.cookieDomain,undefined);
 assert.ok(config.trustedOrigins.includes('https://folders.axxes.app'));
 assert.ok(config.trustedOrigins.includes('https://*.axxes.club'));
});
test('an explicitly configured legacy origin preserves its matching shared cookie domain',()=>{
 assert.equal(foldersAuthConfig({FOLDERS_PUBLIC_URL:'https://dam.axxes.club',AUTH_COOKIE_DOMAIN:'axxes.club'}).cookieDomain,'axxes.club');
});
test('public origins must be trusted Folders hosts and production origins require HTTPS',()=>{
 assert.throws(()=>foldersAuthConfig({FOLDERS_PUBLIC_URL:'https://evil.example'}),/Folders/);
 assert.throws(()=>foldersAuthConfig({FOLDERS_PUBLIC_URL:'http://folders.axxes.app',NODE_ENV:'production'}),/HTTPS/);
});
