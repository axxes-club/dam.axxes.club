export function canOwnAsset(
  asset: { tenantId: string | null; ownerUserId: string | null },
  userId: string,
  tenantIds: string[],
) {
  return asset.tenantId
    ? tenantIds.includes(asset.tenantId)
    : asset.ownerUserId === userId;
}
export function effectiveDeadline(
  asset: Date | null,
  parents: (Date | null)[] = [],
) {
  return (
    [asset, ...parents]
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
  );
}
export function lifecycleAvailable(
  trashedAt: Date | null,
  expiresAt: Date | null,
  now = new Date(),
) {
  return !trashedAt && (!expiresAt || expiresAt > now);
}
export function restoreDeadline(
  current: Date | null,
  replacement: Date | null | undefined,
  now = new Date(),
) {
  const value = replacement === undefined ? current : replacement;
  if (value && value <= now)
    throw new Error(
      "Choose a future expiration or explicitly clear it before restoring",
    );
  return value;
}
