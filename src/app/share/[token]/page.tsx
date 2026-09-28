import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { format } from "date-fns";
import { Folder, Image as ImageIcon } from "lucide-react";
import { db } from "@/lib/db";
import { assets, tenants } from "@/lib/db/schema";
import { verifyShareToken } from "@/lib/share";
import { toAsset } from "@/lib/assets";
import { formatBytes } from "@/lib/format";
import type { Asset } from "@/lib/types";
import { DownloadButton } from "./download-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shared with you", robots: { index: false, follow: false } };

const FOLDER_LIMIT = 500;

export default async function SharePage({ params }: { params: { token: string } }) {
  const payload = verifyShareToken(params.token);
  if (!payload) return <Unavailable />;

  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, payload.t));
  if (!tenant) notFound();

  let items: Asset[];
  if (payload.k === "asset") {
    const rows = await db.select().from(assets).where(and(eq(assets.id, payload.id), eq(assets.tenantId, payload.t)));
    items = rows.map(toAsset);
    if (!items.length) return <Unavailable />;
  } else {
    const rows = await db
      .select()
      .from(assets)
      .where(and(eq(assets.tenantId, payload.t), eq(assets.folder, payload.f)))
      .orderBy(asc(assets.name))
      .limit(FOLDER_LIMIT);
    items = rows.map(toAsset);
  }

  return (
    <div className="min-h-dvh bg-sidebar">
      <header className="flex h-16 items-center gap-3 px-6">
        <Folder className="size-8 fill-folder text-folder-tab" strokeWidth={1.5} />
        <span className="text-lg tracking-tight text-foreground/80">Folders</span>
        <span className="ml-auto text-sm text-muted-foreground">
          Shared by {tenant.name} · expires {format(new Date(payload.exp), "MMM d, yyyy")}
        </span>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-12">
        {payload.k === "asset" ? (
          <Single asset={items[0]} />
        ) : (
          <div className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border">
            <h1 className="flex items-center gap-3 text-2xl">
              <Folder className="size-7 fill-folder/30 text-folder" /> {payload.f}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{items.length} file{items.length === 1 ? "" : "s"}</p>
            {items.length === 0 ? (
              <p className="py-16 text-center text-muted-foreground">This folder is empty.</p>
            ) : (
              <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                {items.map((asset) => (
                  <div key={asset.id} className="flex flex-col rounded-xl bg-secondary p-2 pt-0">
                    <div className="flex h-11 items-center gap-2 pl-1.5">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium" title={asset.name}>{asset.name}</p>
                      <DownloadButton asset={asset} compact />
                    </div>
                    <a href={asset.url} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] overflow-hidden rounded-lg bg-card">
                      {asset.type === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.thumbnailUrl ?? asset.url} alt={asset.altText ?? asset.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{formatBytes(asset.size)}</div>
                      )}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Single({ asset }: { asset: Asset }) {
  return (
    <div className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-2xl">{asset.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{asset.mimeType ?? asset.type} · {formatBytes(asset.size)}</p>
        </div>
        <DownloadButton asset={asset} />
      </div>
      <div className="mt-6 flex min-h-64 items-center justify-center overflow-hidden rounded-xl bg-muted">
        {asset.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt={asset.altText ?? asset.name} className="max-h-[75vh] max-w-full object-contain" />
        ) : asset.type === "video" ? (
          <video src={asset.url} controls className="max-h-[75vh] max-w-full" />
        ) : asset.mimeType === "application/pdf" ? (
          <iframe src={asset.url} title={asset.name} className="h-[75vh] w-full bg-white" />
        ) : (
          <ImageIcon className="size-16 text-muted-foreground" />
        )}
      </div>
      {asset.description && <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm">{asset.description}</p>}
    </div>
  );
}

function Unavailable() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-sidebar px-4 text-center">
      <Folder className="mb-4 size-12 fill-folder/30 text-folder" strokeWidth={1.5} />
      <h1 className="text-xl">This link is no longer available</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        It may have expired, or the file was removed. Ask the person who shared it for a new link.
      </p>
    </div>
  );
}
