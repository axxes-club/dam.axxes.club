import { safeKey } from "./core.mjs";
export function shareProxyUrl(raw, token, { origin, trustedOrigins }) {
  if (!raw) return raw;
  try {
    const source = new URL(raw);
    if (
      source.protocol !== "https:" ||
      source.username ||
      source.password ||
      source.port ||
      !trustedOrigins.includes(source.origin) ||
      source.pathname !== "/api/assets/gcp"
    )
      return raw;
    const key = safeKey(source.searchParams.get("key"));
    const target = new URL("/api/assets/gcp", origin);
    target.searchParams.set("key", key);
    target.searchParams.set("share", token);
    return target.toString();
  } catch {
    return raw;
  }
}
