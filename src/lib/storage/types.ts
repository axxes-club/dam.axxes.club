export type StorageKey={tenantId:string;userId:string};
export type StorageSnapshot={baseBytes:string;paidBytes:string;usedBytes:string;reservedBytes:string;effectiveBytes:string;remainingBytes:string;legacyBytes:string};
export type QuotaActor={kind:'member'|'platform'|'webmaster';id:string};
