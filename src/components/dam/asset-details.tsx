"use client";

import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Copy, ExternalLink, FileText, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBytes } from '@/lib/format';
import type { Asset, TenantAccess } from '@/lib/types';

interface AssetDetailsProps {
  asset: Asset;
  tenant: TenantAccess;
  folders: string[];
  onSaved: (asset: Asset) => void;
  onDeleted: (id: string) => void;
  notify: (message: string, tone?: 'success' | 'error') => void;
}

export function AssetDetails({ asset, tenant, folders, onSaved, onDeleted, notify }: AssetDetailsProps) {
  const [name, setName] = useState(asset.name);
  const [folder, setFolder] = useState(asset.folder ?? '');
  const [tags, setTags] = useState(asset.tags);
  const [tagDraft, setTagDraft] = useState('');
  const [description, setDescription] = useState(asset.description ?? '');
  const [altText, setAltText] = useState(asset.altText ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setName(asset.name);
    setFolder(asset.folder ?? '');
    setTags(asset.tags);
    setTagDraft('');
    setDescription(asset.description ?? '');
    setAltText(asset.altText ?? '');
    setConfirmDelete(false);
  }, [asset]);

  const readOnly = !tenant.canWrite;
  const dirty =
    name !== asset.name ||
    folder !== (asset.folder ?? '') ||
    description !== (asset.description ?? '') ||
    altText !== (asset.altText ?? '') ||
    tags.join('\u0000') !== asset.tags.join('\u0000');

  const addTag = () => {
    const tag = tagDraft.trim().toLowerCase();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setTagDraft('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, folder, tags, description, altText }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Save failed');
      onSaved(body as Asset);
      notify('Changes saved');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Delete failed');
      onDeleted(asset.id);
      notify('Asset deleted');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Delete failed', 'error');
      setDeleting(false);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(asset.url);
      notify('URL copied to clipboard');
    } catch {
      notify('Could not copy URL', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="h-64 bg-slate-100 dark:bg-slate-900 relative flex items-center justify-center overflow-hidden shrink-0">
        {asset.type === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt={asset.altText ?? asset.name} className="object-contain w-full h-full" />
        ) : asset.type === 'video' ? (
          <video src={asset.url} controls className="w-full h-full object-contain" />
        ) : (
          <FileText size={64} className="text-slate-400" />
        )}
      </div>

      <div className="p-6 flex-1 flex flex-col gap-6">
        <div className="space-y-1">
          {readOnly ? (
            <h2 className="text-xl font-bold break-words">{asset.name}</h2>
          ) : (
            <Input
              aria-label="Asset name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-lg font-semibold h-10"
            />
          )}
          <p className="text-sm text-slate-500 capitalize">
            {asset.type}{asset.mimeType ? ` · ${asset.mimeType}` : ''}
          </p>
        </div>

        <div className="flex gap-2">
          <a
            href={asset.url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'outline', className: 'flex-1 gap-2' })}
          >
            <ExternalLink size={14} /> Open original
          </a>
          <Button variant="outline" className="flex-1 gap-2" onClick={copyUrl}>
            <Copy size={14} /> Copy URL
          </Button>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Information</h3>
          <div className="grid grid-cols-2 gap-y-4 text-sm">
            <div>
              <p className="text-slate-500">Size</p>
              <p className="font-medium">{formatBytes(asset.size)}</p>
            </div>
            <div>
              <p className="text-slate-500">Added</p>
              <p className="font-medium">{format(new Date(asset.createdAt), 'MMM d, yyyy')}</p>
            </div>
            {asset.width && asset.height ? (
              <div>
                <p className="text-slate-500">Dimensions</p>
                <p className="font-medium">{asset.width} × {asset.height}</p>
              </div>
            ) : null}
            <div>
              <p className="text-slate-500">Source</p>
              <p className="font-medium capitalize">{asset.source ?? '—'}</p>
            </div>
            {asset.originalFilename && (
              <div className="col-span-2">
                <p className="text-slate-500">Original file</p>
                <p className="font-medium break-all">{asset.originalFilename}</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="asset-folder" className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Folder
          </label>
          {readOnly ? (
            <p className="text-sm font-medium">{asset.folder ?? 'Unfiled'}</p>
          ) : (
            <>
              <Input
                id="asset-folder"
                list="asset-folder-options"
                placeholder="Unfiled"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              />
              <datalist id="asset-folder-options">
                {folders.map((f) => <option key={f} value={f} />)}
              </datalist>
            </>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {tags.length === 0 && readOnly && <span className="text-sm text-slate-400">No tags</span>}
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md text-xs font-medium"
              >
                {tag}
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    className="text-slate-400 hover:text-red-500"
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
          {!readOnly && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addTag();
              }}
            >
              <Input
                placeholder="Add a tag"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
              />
              <Button type="submit" variant="outline" size="icon" aria-label="Add tag" disabled={!tagDraft.trim()}>
                <Plus size={14} />
              </Button>
            </form>
          )}
        </div>

        {(!readOnly || asset.description) && (
          <div className="space-y-2">
            <label htmlFor="asset-description" className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Description
            </label>
            {readOnly ? (
              <p className="text-sm whitespace-pre-wrap">{asset.description}</p>
            ) : (
              <textarea
                id="asset-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring"
              />
            )}
          </div>
        )}

        {asset.type === 'image' && (!readOnly || asset.altText) && (
          <div className="space-y-2">
            <label htmlFor="asset-alt" className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Alt text
            </label>
            {readOnly ? (
              <p className="text-sm">{asset.altText}</p>
            ) : (
              <Input
                id="asset-alt"
                placeholder="Describe the image for screen readers"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
              />
            )}
          </div>
        )}

        <div className="mt-auto pt-6 border-t border-slate-200 dark:border-slate-800 space-y-3">
          {!readOnly && (
            <Button
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!dirty || saving || !name.trim()}
              onClick={save}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          )}
          {tenant.canDelete && (
            confirmDelete ? (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 gap-2 bg-red-600 hover:bg-red-700 text-white"
                  onClick={remove}
                  disabled={deleting}
                >
                  {deleting && <Loader2 size={14} className="animate-spin" />}
                  Delete permanently
                </Button>
              </div>
            ) : (
              <Button className="w-full gap-2 text-red-600" variant="outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Delete asset
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
