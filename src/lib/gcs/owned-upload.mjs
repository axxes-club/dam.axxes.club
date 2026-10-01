import { objectKeyFromUrl } from "./core.mjs";
export async function verifyCompletedUpload({
  url,
  bucket,
  origins,
  app,
  owner,
  route,
  store,
  registry,
}) {
  const key = objectKeyFromUrl(url, { bucket, origins });
  if (!key?.startsWith("uploads/" + app + "/")) return false;
  const file = await store.stat(key);
  const id = file?.metadata?.uploadid ?? file?.metadata?.uploadId;
  if (!id) return false;
  const record = await registry.get(id);
  return (
    !!record &&
    record.app === app &&
    record.route === route &&
    record.owner === owner &&
    record.key === key &&
    record.result?.key === key
  );
}
