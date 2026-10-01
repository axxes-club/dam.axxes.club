import { Storage } from "@google-cloud/storage";
import { verifiedAliases } from "./manifest.mjs";
export function loadAliases({
  storage = new Storage(),
  bucket,
  manifestObject = "control/source-url-to-gcs-object.json",
  progressObject = "control/storage-copy-progress.json",
  now = Date.now,
}) {
  let cached, pending;
  return async () => {
    if (cached && cached.until > now()) return cached.value;
    if (pending) return pending;
    pending = (async () => {
      const b = storage.bucket(bucket);
      const parse = async (key) => {
        const [bytes] = await b.file(key).download();
        return JSON.parse(bytes.toString("utf8"));
      };
      const [manifest, progress] = await Promise.all([
        parse(manifestObject),
        parse(progressObject),
      ]);
      const value = verifiedAliases(manifest, progress, bucket);
      value.reverse = {};
      for (const [url, entry] of Object.entries(value.aliases)) {
        (value.reverse[entry.object_name] ??= []).push(url);
      }
      cached = { until: now() + 60000, value };
      return value;
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  };
}
