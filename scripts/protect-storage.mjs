import { neon } from "@neondatabase/serverless";
import { UTApi } from "uploadthing/server";

// Dry-run by default. Production ACL changes require an explicitly reviewed
// --apply invocation after dependent apps adopt authenticated delivery.
const apply = process.argv.includes("--apply");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`select url from assets where source='upload'`;
const keys = new Set();
let unresolved = 0;
for (const row of rows) {
  try {
    const url = new URL(row.url);
    const trusted = url.protocol === "https:" && [".ufs.sh", ".utfs.io", ".uploadthing.com"].some(domain => url.hostname.endsWith(domain));
    const match = url.pathname.match(/^\/f\/([^/]+)$/);
    if (!trusted || !match) { unresolved++; continue; }
    keys.add(decodeURIComponent(match[1]));
  } catch { unresolved++; }
}
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", hostedAssets: rows.length, uniqueStorageObjects: keys.size, unresolvedAssets: unresolved }));
if (unresolved) throw new Error("Resolve unrecognized hosted assets before proceeding; no storage changes made");
if (apply) {
  if (!process.env.UPLOADTHING_TOKEN) throw new Error("UPLOADTHING_TOKEN is required for --apply");
  const api = new UTApi();
  const list = [...keys];
  for (let i = 0; i < list.length; i += 100) {
    const result = await api.updateACL(list.slice(i, i + 100), "private");
    if (!result.success) throw new Error("Storage provider did not confirm private ACL. Stop rollout and review the batch.");
    console.log(`Protected ${Math.min(i + 100, list.length)} of ${list.length} objects`);
  }
}
