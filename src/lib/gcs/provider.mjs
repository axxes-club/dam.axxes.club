export function createProviderUpload({
  fetchImpl = fetch,
  gcsUpload,
  legacyUpload,
}) {
  return async (route, options) => {
    const response = await fetchImpl("/api/storage", {
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
    });
    if (!response.ok) throw Error("Storage configuration unavailable");
    const config = await response.json();
    if (typeof config.enabled !== "boolean")
      throw Error("Invalid storage configuration");
    return (config.enabled ? gcsUpload : legacyUpload)(route, options);
  };
}
