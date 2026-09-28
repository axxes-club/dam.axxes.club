"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Folder as FolderIcon,
  FolderPlus,
  Image as ImageIcon,
  FileText,
  File as FileIcon,
  Video,
  Search,
  UploadCloud,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  LogOut,
  Inbox,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useUploadThing } from '@/utils/uploadthing';
import { authClient } from '@/lib/auth-client';
import { formatBytes } from '@/lib/format';
import { FOLDER_HEADER, TENANT_HEADER } from '@/lib/upload-headers';
import type { Asset, AssetPage, AssetType, FolderSummary, Viewer } from '@/lib/types';
import { AssetDetails } from './asset-details';

const UNFILED = '__unfiled__';
const TENANT_STORAGE_KEY = 'dam:tenant';
const ACCEPT = 'image/*,video/*,application/pdf';

const TYPE_FILTERS: { type: AssetType; label: string; icon: React.ReactNode }[] = [
  { type: 'image', label: 'Images', icon: <ImageIcon size={18} /> },
  { type: 'video', label: 'Videos', icon: <Video size={18} /> },
  { type: 'document', label: 'Documents', icon: <FileText size={18} /> },
];

interface Notice {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function AssetThumb({ asset, iconSize }: { asset: Asset; iconSize: number }) {
  const [failed, setFailed] = useState(false);
  if (asset.type === 'image' && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.thumbnailUrl ?? asset.url}
        alt={asset.altText ?? asset.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
      />
    );
  }
  const Icon = asset.type === 'video' ? Video : asset.type === 'document' ? FileText : asset.type === 'image' ? ImageIcon : FileIcon;
  return <div className="text-slate-400"><Icon size={iconSize} /></div>;
}

export function DamApp({ viewer }: { viewer: Viewer }) {
  const router = useRouter();

  const [tenantId, setTenantId] = useState<string | null>(viewer.tenants[0]?.id ?? null);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<AssetType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounced(searchQuery.trim(), 300);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [assets, setAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [draftFolders, setDraftFolders] = useState<string[]>([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tenant = viewer.tenants.find((t) => t.id === tenantId) ?? null;

  // Restore the last workspace the viewer used
  useEffect(() => {
    try {
      const stored = localStorage.getItem(TENANT_STORAGE_KEY);
      if (stored && viewer.tenants.some((t) => t.id === stored)) setTenantId(stored);
    } catch {}
  }, [viewer.tenants]);

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setNotices((n) => [...n, { id, message, tone }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 4000);
  }, []);

  const buildQuery = useCallback(
    (offset: number) => {
      const params = new URLSearchParams({ tenantId: tenantId!, offset: String(offset) });
      if (debouncedQuery) params.set('q', debouncedQuery);
      if (typeFilter) params.set('type', typeFilter);
      if (currentFolder) params.set('folder', currentFolder);
      return `/api/assets?${params}`;
    },
    [tenantId, debouncedQuery, typeFilter, currentFolder]
  );

  // Load the first page whenever the view changes
  useEffect(() => {
    if (!tenantId) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    fetch(buildQuery(0), { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to load assets');
        return res.json() as Promise<AssetPage>;
      })
      .then((page) => {
        setAssets(page.assets);
        setTotal(page.total);
        setNextOffset(page.nextOffset);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load assets');
        setLoading(false);
      });
    return () => controller.abort();
  }, [tenantId, buildQuery, reloadKey]);

  const refreshFolders = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/folders?tenantId=${tenantId}`);
      if (res.ok) setFolders((await res.json()).folders);
    } catch {}
  }, [tenantId]);

  useEffect(() => {
    setFolders([]);
    refreshFolders();
  }, [refreshFolders]);

  const loadMore = async () => {
    if (nextOffset == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildQuery(nextOffset));
      if (!res.ok) throw new Error('Failed to load more assets');
      const page = (await res.json()) as AssetPage;
      setAssets((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...page.assets.filter((a) => !seen.has(a.id))];
      });
      setTotal(page.total);
      setNextOffset(page.nextOffset);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to load more assets', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const switchTenant = (id: string) => {
    setTenantId(id);
    setCurrentFolder(null);
    setDraftFolders([]);
    setSelectedAsset(null);
    try {
      localStorage.setItem(TENANT_STORAGE_KEY, id);
    } catch {}
  };

  const uploadFolder = currentFolder && currentFolder !== UNFILED ? currentFolder : null;

  const { startUpload, isUploading } = useUploadThing('assetUploader', {
    headers: () => {
      const headers: Record<string, string> = { [TENANT_HEADER]: tenantId ?? '' };
      if (uploadFolder) headers[FOLDER_HEADER] = encodeURIComponent(uploadFolder);
      return headers;
    },
    onClientUploadComplete: (res) => {
      notify(`Uploaded ${res.length} file${res.length === 1 ? '' : 's'}`);
      setReloadKey((k) => k + 1);
      refreshFolders();
    },
    onUploadError: (error) => {
      notify(error.message || 'Upload failed', 'error');
    },
  });

  const uploadFiles = (files: File[]) => {
    if (!tenant?.canWrite || files.length === 0) return;
    const accepted = files.filter((f) => /^(image|video)\//.test(f.type) || f.type === 'application/pdf');
    if (accepted.length < files.length) notify('Only images, videos and PDFs can be uploaded', 'error');
    if (accepted.length) startUpload(accepted);
  };

  const folderNames = useMemo(() => {
    const names = new Set(folders.map((f) => f.name));
    draftFolders.forEach((f) => names.add(f));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [folders, draftFolders]);

  const folderCounts = useMemo(() => new Map(folders.map((f) => [f.name, f.count])), [folders]);

  const createFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFolderName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (!folderNames.includes(name)) setDraftFolders((d) => [...d, name]);
    setCurrentFolder(name);
    setTypeFilter(null);
    setNewFolderName('');
    setNewFolderOpen(false);
  };

  const handleSaved = (updated: Asset) => {
    setSelectedAsset(updated);
    const leavesView = currentFolder && currentFolder !== (updated.folder ?? UNFILED);
    if (leavesView) {
      setAssets((prev) => prev.filter((a) => a.id !== updated.id));
      setTotal((t) => Math.max(0, t - 1));
    } else {
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    }
    refreshFolders();
  };

  const handleDeleted = (id: string) => {
    setSelectedAsset(null);
    setAssets((prev) => prev.filter((a) => a.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    refreshFolders();
  };

  const signOut = async () => {
    await authClient.signOut();
    router.push('/sign-in');
    router.refresh();
  };

  const selectView = (folder: string | null, type: AssetType | null) => {
    setCurrentFolder(folder);
    setTypeFilter(type);
  };

  const title = currentFolder === UNFILED
    ? 'Unfiled'
    : currentFolder ?? (typeFilter ? TYPE_FILTERS.find((t) => t.type === typeFilter)!.label : 'All Assets');

  if (!tenant) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <Card className="max-w-md p-8 text-center space-y-4">
          <Inbox size={40} className="mx-auto text-slate-400" />
          <h1 className="text-xl font-semibold">No workspace access</h1>
          <p className="text-sm text-slate-500">
            Your account ({viewer.email}) isn&apos;t a member of any AXXES workspace yet. Ask a workspace admin to invite you.
          </p>
          <Button variant="outline" onClick={signOut} className="gap-2">
            <LogOut size={14} /> Sign out
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans">

      {/* SIDEBAR */}
      <div className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
              A
            </div>
            <span className="font-semibold text-lg tracking-tight">AXXES DAM</span>
          </div>
          {viewer.tenants.length > 1 ? (
            <select
              aria-label="Workspace"
              value={tenant.id}
              onChange={(e) => switchTenant(e.target.value)}
              className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 text-sm"
            >
              {viewer.tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate">{tenant.name}</p>
          )}
          <a
            href="https://members.axxes.club"
            className="block text-xs text-slate-500 hover:text-blue-600"
          >
            ← Back to Members Portal
          </a>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-1 mb-6">
            <Button
              variant={currentFolder === null && typeFilter === null ? 'secondary' : 'ghost'}
              className="w-full justify-start gap-2"
              onClick={() => selectView(null, null)}
            >
              <LayoutGrid size={18} /> All Assets
            </Button>
            {TYPE_FILTERS.map(({ type, label, icon }) => (
              <Button
                key={type}
                variant={currentFolder === null && typeFilter === type ? 'secondary' : 'ghost'}
                className="w-full justify-start gap-2"
                onClick={() => selectView(null, type)}
              >
                {icon} {label}
              </Button>
            ))}
          </div>

          <div className="mb-2 px-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Folders</span>
            {tenant.canWrite && (
              <button
                type="button"
                aria-label="New folder"
                title="New folder"
                className="text-slate-400 hover:text-blue-600"
                onClick={() => setNewFolderOpen((o) => !o)}
              >
                <FolderPlus size={16} />
              </button>
            )}
          </div>
          {newFolderOpen && (
            <form onSubmit={createFolder} className="mb-2 px-1">
              <Input
                autoFocus
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setNewFolderOpen(false)}
              />
              <p className="mt-1 px-1 text-[11px] text-slate-400">
                Folders are saved once an asset is added to them.
              </p>
            </form>
          )}
          <div className="space-y-1">
            <Button
              variant={currentFolder === UNFILED ? 'secondary' : 'ghost'}
              className="w-full justify-start gap-2"
              onClick={() => selectView(UNFILED, null)}
            >
              <Inbox size={18} className="text-slate-400" /> Unfiled
            </Button>
            {folderNames.map((name) => (
              <Button
                key={name}
                variant={currentFolder === name ? 'secondary' : 'ghost'}
                className="w-full justify-start gap-2"
                onClick={() => selectView(name, null)}
              >
                <FolderIcon size={18} className="text-blue-500 shrink-0" />
                <span className="truncate flex-1 text-left">{name}</span>
                <span className="text-xs text-slate-400">{folderCounts.get(name) ?? 0}</span>
              </Button>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{viewer.name}</p>
            <p className="text-xs text-slate-500 truncate capitalize">{tenant.role}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={signOut}>
            <LogOut size={16} />
          </Button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        onDragOver={(e) => {
          if (!tenant.canWrite || !e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(e) => {
          if (!tenant.canWrite) return;
          e.preventDefault();
          setDragging(false);
          uploadFiles(Array.from(e.dataTransfer.files));
        }}
      >
        {dragging && (
          <div className="absolute inset-0 z-20 m-4 rounded-2xl border-2 border-dashed border-blue-500 bg-blue-50/80 dark:bg-blue-950/60 flex flex-col items-center justify-center pointer-events-none">
            <UploadCloud size={48} className="text-blue-600 mb-3" />
            <p className="font-medium text-blue-700 dark:text-blue-300">
              Drop to upload to {uploadFolder ?? tenant.name}
            </p>
          </div>
        )}

        {/* TOP BAR */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <Input
              placeholder="Search assets, tags..."
              className="pl-10 bg-slate-100 dark:bg-slate-800 border-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                aria-label="Grid view"
                className="h-8 w-8"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid size={16} />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                aria-label="List view"
                className="h-8 w-8"
                onClick={() => setViewMode('list')}
              >
                <ListIcon size={16} />
              </Button>
            </div>

            {tenant.canWrite && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    uploadFiles(Array.from(e.target.files ?? []));
                    e.target.value = '';
                  }}
                />
                <Button
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
                  {isUploading ? 'Uploading…' : 'Upload'}
                </Button>
              </>
            )}
          </div>
        </header>

        {/* ASSET AREA */}
        <ScrollArea className="flex-1 min-h-0 bg-slate-50 dark:bg-slate-950">
          <div className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-bold tracking-tight truncate">
                {debouncedQuery ? `Results for “${debouncedQuery}”` : title}
                {debouncedQuery && (currentFolder || typeFilter) && (
                  <span className="text-base font-normal text-slate-500"> in {title}</span>
                )}
              </h1>
              <span className="text-sm text-slate-500 shrink-0">
                {loading ? 'Loading…' : `${total.toLocaleString()} item${total === 1 ? '' : 's'}`}
              </span>
            </div>

            {loadError ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-3">
                <AlertTriangle size={40} className="text-amber-500" />
                <p>{loadError}</p>
                <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>
              </div>
            ) : loading && assets.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-slate-400">
                <Loader2 size={32} className="animate-spin" />
              </div>
            ) : assets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-center">
                <FolderIcon size={48} className="mb-4 opacity-50" />
                <p>No assets found in this view.</p>
                {tenant.canWrite && !debouncedQuery && (
                  <p className="text-sm mt-1">Drag files here or use Upload to add some.</p>
                )}
              </div>
            ) : (
              <>
                <div
                  className={`${loading ? 'opacity-60' : ''} ${
                    viewMode === 'grid'
                      ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
                      : 'flex flex-col gap-2'
                  }`}
                >
                  {assets.map((asset) => (
                    <Card
                      key={asset.id}
                      role="button"
                      tabIndex={0}
                      className={`group cursor-pointer overflow-hidden border-slate-200 dark:border-slate-800 transition-all hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 ${
                        viewMode === 'list' ? 'flex flex-row items-center p-2' : 'flex flex-col'
                      }`}
                      onClick={() => setSelectedAsset(asset)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedAsset(asset);
                        }
                      }}
                    >
                      <div
                        className={`${
                          viewMode === 'list' ? 'w-16 h-16 mr-4 shrink-0 rounded-md' : 'aspect-square w-full'
                        } bg-slate-100 dark:bg-slate-800 relative flex items-center justify-center overflow-hidden`}
                      >
                        <AssetThumb asset={asset} iconSize={viewMode === 'list' ? 24 : 32} />
                      </div>

                      <div className={`p-3 flex flex-col justify-center min-w-0 ${viewMode === 'list' ? 'flex-1' : ''}`}>
                        <p className="text-sm font-medium truncate" title={asset.name}>{asset.name}</p>
                        <p className="text-xs text-slate-500 mt-1 flex items-center justify-between gap-2">
                          <span>{viewMode === 'list' && asset.folder ? asset.folder : formatBytes(asset.size)}</span>
                          {viewMode === 'grid' && <span>{format(new Date(asset.createdAt), 'MMM d, yyyy')}</span>}
                        </p>
                      </div>

                      {viewMode === 'list' && (
                        <>
                          <div className="px-4 text-xs text-slate-500 w-24 shrink-0 text-right">{formatBytes(asset.size)}</div>
                          <div className="px-4 text-xs text-slate-500 w-32 shrink-0">
                            {format(new Date(asset.createdAt), 'MMM d, yyyy')}
                          </div>
                        </>
                      )}
                    </Card>
                  ))}
                </div>

                {nextOffset != null && (
                  <div className="flex justify-center mt-8">
                    <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="gap-2">
                      {loadingMore && <Loader2 size={14} className="animate-spin" />}
                      Load more ({(total - assets.length).toLocaleString()} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ASSET DETAILS SHEET */}
      <Sheet open={!!selectedAsset} onOpenChange={(open) => !open && setSelectedAsset(null)}>
        <SheetContent className="w-full sm:max-w-md p-0 overflow-y-auto">
          {selectedAsset && (
            <AssetDetails
              asset={selectedAsset}
              tenant={tenant}
              folders={folderNames}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              notify={notify}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* NOTICES */}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80" aria-live="polite">
        {notices.map((n) => (
          <div
            key={n.id}
            className="flex items-start gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm shadow-lg"
          >
            {n.tone === 'error' ? (
              <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
            )}
            <span>{n.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
