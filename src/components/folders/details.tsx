"use client";

import * as React from "react";
import { format } from "date-fns";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink, Link2, Loader2, Share2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Asset } from "@/lib/types";
import { api, downloadAsset, formatBytes, notify, Thumb, TypeIcon } from "./utils";

interface DetailsProps {
  asset: Asset;
  folders: string[];
  canWrite: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
  onPreview: () => void;
  onShare: () => void;
  onDelete: () => void;
}

export function DetailsPanel({ asset, folders, canWrite, canDelete, onClose, onSaved, onPreview, onShare, onDelete }: DetailsProps) {
  const [name, setName] = React.useState(asset.name);
  const [folder, setFolder] = React.useState(asset.folder ?? "");
  const [tags, setTags] = React.useState(asset.tags);
  const [tagDraft, setTagDraft] = React.useState("");
  const [description, setDescription] = React.useState(asset.description ?? "");
  const [altText, setAltText] = React.useState(asset.altText ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setName(asset.name);
    setFolder(asset.folder ?? "");
    setTags(asset.tags);
    setTagDraft("");
    setDescription(asset.description ?? "");
    setAltText(asset.altText ?? "");
  }, [asset]);

  const dirty =
    name !== asset.name ||
    folder !== (asset.folder ?? "") ||
    description !== (asset.description ?? "") ||
    altText !== (asset.altText ?? "") ||
    tags.join("\u0000") !== asset.tags.join("\u0000");

  const addTag = () => {
    const tag = tagDraft.trim().toLowerCase();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setTagDraft("");
  };

  const save = async () => {
    setSaving(true);
    try {
      onSaved(
        await api<Asset>(`/api/assets/${asset.id}`, {
          method: "PATCH",
          body: { name, folder: folder || null, tags, description, altText },
        })
      );
      notify.success("Changes saved");
    } catch (err) {
      notify.error(err);
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(asset.url);
    notify.success("File link copied");
  };

  return (
    <aside
      className="flex w-[22rem] shrink-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border"
      onContextMenu={(e) => e.stopPropagation()}
      aria-label="File details"
    >
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <TypeIcon asset={asset} className="size-5 shrink-0" />
        <h2 className="flex-1 truncate font-medium" title={asset.name}>{asset.name}</h2>
        <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={onClose} aria-label="Close details">
          <X />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <button
          type="button"
          onClick={onPreview}
          className="mt-2 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-muted"
          aria-label="Open preview"
        >
          <Thumb asset={asset} className="object-contain" iconClassName="size-14" />
        </button>

        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={() => downloadAsset(asset)}>
            <Download /> Download
          </Button>
          {canWrite && (
            <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={onShare}>
              <Share2 /> Share
            </Button>
          )}
          <Button variant="outline" size="icon-sm" className="rounded-full" onClick={copyLink} aria-label="Copy file link">
            <Link2 />
          </Button>
        </div>

        <Section title="File details">
          <dl className="grid gap-3 text-sm">
            <Row label="Type">{asset.mimeType ?? asset.type}</Row>
            <Row label="Size">{formatBytes(asset.size)}</Row>
            {asset.width && asset.height ? <Row label="Dimensions">{asset.width} × {asset.height}</Row> : null}
            <Row label="Location">{asset.folder ?? "Unfiled"}</Row>
            <Row label="Added">{format(new Date(asset.createdAt), "MMM d, yyyy 'at' h:mm a")}</Row>
            <Row label="Modified">{format(new Date(asset.updatedAt), "MMM d, yyyy")}</Row>
            <Row label="Source">{asset.source === "upload" ? "Uploaded" : "Linked"}</Row>
          </dl>
        </Section>

        {canWrite ? (
          <Section title="Edit">
            <div className="grid gap-3">
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Folder">
                <Input list="folder-options" placeholder="Unfiled" value={folder} onChange={(e) => setFolder(e.target.value)} />
                <datalist id="folder-options">
                  {folders.map((f) => <option key={f} value={f} />)}
                </datalist>
              </Field>
              <Field label="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs text-accent-foreground">
                      {tag}
                      <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => setTags(tags.filter((t) => t !== tag))}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); addTag(); }}>
                  <Input placeholder="Add a tag and press Enter" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} />
                </form>
              </Field>
              <Field label="Description">
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </Field>
              {asset.type === "image" && (
                <Field label="Alt text">
                  <Input placeholder="Describe the image" value={altText} onChange={(e) => setAltText(e.target.value)} />
                </Field>
              )}
            </div>
          </Section>
        ) : (
          (asset.tags.length > 0 || asset.description) && (
            <Section title="About">
              {asset.tags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {asset.tags.map((t) => <span key={t} className="rounded-full bg-accent px-2.5 py-0.5 text-xs">{t}</span>)}
                </div>
              )}
              {asset.description && <p className="whitespace-pre-wrap text-sm">{asset.description}</p>}
            </Section>
          )
        )}
      </div>

      {(canWrite || canDelete) && (
        <div className="flex gap-2 border-t p-3">
          {canDelete && (
            <Button variant="ghost" size="icon" className="rounded-full text-destructive hover:text-destructive" onClick={onDelete} aria-label="Delete file">
              <Trash2 />
            </Button>
          )}
          {canWrite && (
            <Button className="ml-auto rounded-full px-5" disabled={!dirty || saving || !name.trim()} onClick={save}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2.5 text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// ── Full-screen preview (dark overlay, arrow keys to move) ───────────────

export function Preview({
  assets,
  index,
  onIndexChange,
  onClose,
}: {
  assets: Asset[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const asset = index != null ? assets[index] : null;

  React.useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < assets.length - 1) onIndexChange(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [index, assets.length, onIndexChange, onClose]);

  if (!asset || index == null) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white" role="dialog" aria-modal aria-label={`Preview of ${asset.name}`} onContextMenu={(e) => e.stopPropagation()}>
      <div className="flex h-16 shrink-0 items-center gap-3 px-4">
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close preview">
          <ArrowLeft className="size-5" />
        </button>
        <TypeIcon asset={asset} className="size-5 shrink-0" />
        <span className="truncate font-medium">{asset.name}</span>
        <span className="text-sm text-white/60">{index + 1} of {assets.length}</span>
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={() => window.open(asset.url, "_blank", "noopener,noreferrer")} className="rounded-full p-2 hover:bg-white/10" aria-label="Open in new tab">
            <ExternalLink className="size-5" />
          </button>
          <button type="button" onClick={() => downloadAsset(asset)} className="rounded-full p-2 hover:bg-white/10" aria-label="Download">
            <Download className="size-5" />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-8" onClick={onClose}>
        <div className="flex max-h-full max-w-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {asset.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.url} alt={asset.altText ?? asset.name} className="max-h-[calc(100vh-8rem)] max-w-full rounded-lg object-contain" />
          ) : asset.type === "video" ? (
            <video key={asset.id} src={asset.url} controls autoPlay className="max-h-[calc(100vh-8rem)] max-w-full rounded-lg" />
          ) : asset.mimeType === "application/pdf" ? (
            <iframe src={asset.url} title={asset.name} className="h-[calc(100vh-8rem)] w-[min(900px,90vw)] rounded-lg bg-white" />
          ) : asset.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
              asset.mimeType === "application/msword" ||
              asset.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
              asset.mimeType === "application/vnd.ms-powerpoint" ? (
            <iframe src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(asset.url)}`} title={asset.name} className="h-[calc(100vh-8rem)] w-[min(900px,90vw)] rounded-lg bg-white" />
          ) : asset.mimeType?.startsWith("audio/") ? (
            <audio key={asset.id} src={asset.url} controls autoPlay />
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/5 p-10">
              <TypeIcon asset={asset} className="size-16" />
              <p className="text-white/70">No preview available</p>
              <Button onClick={() => downloadAsset(asset)} className="rounded-full"><Download /> Download</Button>
            </div>
          )}
        </div>
        {index > 0 && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onIndexChange(index - 1); }} className="absolute left-4 rounded-full bg-white/10 p-3 hover:bg-white/20" aria-label="Previous">
            <ChevronLeft className="size-6" />
          </button>
        )}
        {index < assets.length - 1 && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onIndexChange(index + 1); }} className="absolute right-4 rounded-full bg-white/10 p-3 hover:bg-white/20" aria-label="Next">
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>
    </div>
  );
}
