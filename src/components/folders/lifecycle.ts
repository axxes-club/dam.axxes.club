export function lifecycleStatus(
  asset: {
    expiresAt?: string | null;
    effectiveExpiresAt?: string | null;
    trashedAt?: string | null;
    trashReason?: string | null;
  },
  now = Date.now(),
): string {
  if (asset.trashedAt)
    return `In Trash${asset.trashReason ? ` · ${asset.trashReason}` : ""}`;
  const deadline = asset.effectiveExpiresAt ?? asset.expiresAt;
  if (!deadline) return "No expiration";
  return Date.parse(deadline) <= now
    ? "Expired"
    : `Expires ${new Date(deadline).toLocaleString()}`;
}
export function expirationValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Choose a valid expiration date");
  return date.toISOString();
}
export function localDateInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function expirationPatch(
  original: string,
  edited: string,
  canDelete: boolean,
): { expiresAt?: string | null } {
  return canDelete && original !== edited
    ? { expiresAt: expirationValue(edited) }
    : {};
}
export function blockingFolder<
  T extends {
    path: string;
    expiresAt: string | null;
    trashedAt: string | null;
  },
>(folder: string | null, policies: T[], now = Date.now()): T | undefined {
  return policies.find(
    (p) =>
      !!folder &&
      (folder === p.path || folder.startsWith(p.path + "/")) &&
      (!!p.trashedAt || (!!p.expiresAt && Date.parse(p.expiresAt) <= now)),
  );
}
