import { safeKey } from "./core.mjs";
export function verifiedAliases(manifest, progress, bucket) {
  if (manifest.bucket !== bucket || progress.bucket !== bucket)
    throw Error("Migration manifest bucket mismatch");
  const verifiedKeys = new Set(
    progress.objects
      .filter((o) => o.copy_status === "verified")
      .map((o) => safeKey(o.object_name)),
  );
  const aliases = {};
  for (const [url, record] of Object.entries(manifest.URL_map ?? {}))
    if (verifiedKeys.has(record.object_name)) aliases[url] = record;
  return { verifiedKeys, aliases };
}
