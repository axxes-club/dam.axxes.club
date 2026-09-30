"use client";

import * as React from "react";
import { File as FileIcon, FileText, Image as ImageIcon, Music, Video } from "lucide-react";
import { toast as toastManager } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { Asset } from "@/lib/types";

export { formatBytes } from "@/lib/format";

// ── API ──
export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init?.signal,
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Something went wrong");
  return data as T;
}

// ── Toasts ──
export const notify = {
  success: (title: string) => toastManager.add({ title, type: "success", timeout: 3500 }),
  error: (err: unknown) =>
    toastManager.add({ title: err instanceof Error ? err.message : String(err), type: "error", timeout: 6000 }),
  info: (title: string) => toastManager.add({ title, type: "info", timeout: 3500 }),
  loading: (title: string) => toastManager.add({ title, type: "loading", timeout: 0 }),
  update: (id: string, title: string, type: "success" | "error" | "loading") =>
    toastManager.update(id, { title, type, timeout: type === "loading" ? 0 : 4000 }),
};

export function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

// ── Files ──
export function fileExtension(asset: Asset): string | null {
  let source = asset.originalFilename ?? "";
  if (!source) {
    try {
      source = new URL(asset.url).pathname;
    } catch {
      return null;
    }
  }
  const ext = source.split(".").pop();
  return ext && ext.length <= 5 && ext !== source ? ext.toUpperCase() : null;
}

export function TypeIcon({ asset, className }: { asset: Asset; className?: string }) {
  if (asset.type === "image") return <ImageIcon className={cn("text-rose-500", className)} />;
  if (asset.type === "video") return <Video className={cn("text-violet-500", className)} />;
  if (asset.mimeType?.startsWith("audio/")) return <Music className={cn("text-amber-500", className)} />;
  if (asset.type === "document") return <FileText className={cn("text-sky-600", className)} />;
  return <FileIcon className={cn("text-muted-foreground", className)} />;
}

export function Thumb({ asset, className, iconClassName }: { asset: Asset; className?: string; iconClassName?: string }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [asset.id, asset.url, asset.thumbnailUrl]);
  if (asset.type === "image" && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.thumbnailUrl ?? asset.url}
        alt={asset.altText ?? asset.name}
        loading="lazy"
        draggable={false}
        onError={() => setFailed(true)}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }
  const ext = fileExtension(asset);
  return (
    <div className={cn("flex h-full w-full flex-col items-center justify-center gap-1.5", className)}>
      <TypeIcon asset={asset} className={cn("size-10", iconClassName)} />
      {failed && <span className="text-xs text-muted-foreground" role="status">Image unavailable</span>}
      {ext && <span className="text-[10px] font-semibold tracking-wider text-muted-foreground">{ext}</span>}
    </div>
  );
}

function downloadName(asset: Asset) {
  if (asset.originalFilename) return asset.originalFilename;
  const ext = fileExtension(asset);
  return ext ? `${asset.name}.${ext.toLowerCase()}` : asset.name;
}

// Saves the file when the host allows cross-origin reads; otherwise opens it in a new tab.
export async function downloadAsset(asset: Asset) {
  try {
    const res = await fetch(asset.url, { mode: "cors" });
    if (!res.ok) throw new Error(String(res.status));
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = href;
    a.download = downloadName(asset);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    window.open(asset.url, "_blank", "noopener,noreferrer");
  }
}

export function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
