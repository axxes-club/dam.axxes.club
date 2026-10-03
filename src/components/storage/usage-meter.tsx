'use client';
import type{StorageSnapshot}from'../../lib/storage/types';
import{formatBytes,storagePercent}from'../../lib/storage/format.mjs';
export function UsageMeter({snapshot:s,compact=false}:{snapshot:StorageSnapshot;compact?:boolean}){
 const over=BigInt(s.usedBytes)>BigInt(s.effectiveBytes);
 return <section aria-label="Storage usage" className="space-y-2 rounded-lg border p-3 text-sm">
  <div className="flex justify-between gap-3"><strong>Storage</strong><span>{formatBytes(s.usedBytes)} of {formatBytes(s.effectiveBytes)}</span></div>
  <progress className="h-2 w-full" aria-label="Storage used" max={100} value={storagePercent(s.usedBytes,s.effectiveBytes)}/>
  <p>{formatBytes(s.remainingBytes)} available{BigInt(s.reservedBytes)>BigInt(0)&&<> · {formatBytes(s.reservedBytes)} reserved for uploads</>}</p>
  {over&&<p role="status">You’re above your allowance. Your files are safe; new uploads are paused.</p>}
  {!compact&&<><p>Base allowance: {formatBytes(s.baseBytes)} · Purchased extra: {formatBytes(s.paidBytes)}</p>{BigInt(s.legacyBytes)>BigInt(0)&&<p>Older organization files: {formatBytes(s.legacyBytes)}. They don’t count against your personal allowance.</p>}<p className="text-muted-foreground">Space is released after permanent file removal.</p></>}
 </section>;
}
