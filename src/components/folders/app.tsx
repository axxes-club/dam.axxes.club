"use client";

import type { CustomerBrand } from "@/lib/white-label";
import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  CopyPlus,
  Smartphone,
  Download,
  ExternalLink,
  Eye,
  FilePen,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPen,
  FolderPlus,
  HardDrive,
  Home,
  Image as ImageIcon,
  Inbox,
  Info,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  LogOut,
  MoreVertical,
  PanelLeft,
  Building2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Share2,
  SquareCheck,
  Tag,
  Trash2,
  Upload,
  UploadCloud,
  UserCog,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useUploadThing } from "@/utils/uploadthing";
import { FOLDER_HEADER, TENANT_HEADER } from "@/lib/upload-headers";
import { appTarget, type AppLinkTarget } from "@/lib/app-links";
import { UNFILED, type Asset, type AssetPage, type AssetSort, type AssetType, type Overview, type Viewer } from "@/lib/types";
import { api, downloadAsset, formatBytes, notify, plural, Thumb, TypeIcon, useDebounced } from "./utils";
import { FolderDialogs, type DialogState } from "./dialogs";
import { DetailsPanel, Preview } from "./details";
import PhotoHandoffDialog from "./PhotoHandoffDialog";

const TENANT_KEY = "folders:tenant";
const LAYOUT_KEY = "folders:layout";
/** Opens a file in another AXXES app, in a new tab like every other "open in". */
function openApp(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Whether a file is worth offering to open in Office: documents and
 * spreadsheets, because those are what Office edits. A video or a photo is not
 * something Quill can usefully turn into a document.
 */
function canOpenInOffice(asset: { type: string; mimeType?: string | null }): boolean {
  if (asset.type !== "document") return false;
  const mime = asset.mimeType ?? "";
  return !mime.startsWith("video/") && !mime.startsWith("audio/");
}

const officeTarget: AppLinkTarget | null = appTarget("office");

const DRAG_MIME = "application/x-folders-ids";
const PORTAL_URL = "https://members.axxes.club/assets";

type View = { kind: "home" } | { kind: "recent" } | { kind: "type"; type: AssetType } | { kind: "folder"; folder: string };
type MenuTarget = { kind: "assets"; ids: string[] } | { kind: "folder"; folder: string } | { kind: "background" };

const TYPE_NAV: { type: AssetType; label: string; icon: React.ElementType }[] = [
  { type: "image", label: "Images", icon: ImageIcon },
  { type: "video", label: "Videos", icon: Video },
  { type: "document", label: "Documents", icon: FileText },
];

const SORTS: { value: AssetSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "largest", label: "Largest first" },
  { value: "smallest", label: "Smallest first" },
];

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

// Opens the context menu at an element, used by the ⋮ buttons on cards
function openMenuAt(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.bottom }));
}

const BrandContext = React.createContext<CustomerBrand | null>(null);

/** Folders, in a white-label customer's own brand when there is one. */
export function FoldersApp({ brand = null, ...props }: { viewer: Viewer; handshakeUrl: string | null; brand?: CustomerBrand | null }) {
  return (
    <BrandContext.Provider value={brand}>
      <div style={brand?.accent ? ({ display: "contents", "--primary": brand.accent } as React.CSSProperties) : { display: "contents" }}>
        <FoldersAppInner {...props} />
      </div>
    </BrandContext.Provider>
  );
}

function FoldersAppInner({ viewer, handshakeUrl }: { viewer: Viewer; handshakeUrl: string | null }) {
  const router = useRouter();

  // ── Workspace ──
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [tenantId, setTenantId] = React.useState<string | null>(viewer.tenants[0]?.id ?? null);
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(TENANT_KEY);
      if (stored && viewer.tenants.some((t) => t.id === stored)) setTenantId(stored);
      const layout = localStorage.getItem(LAYOUT_KEY);
      if (layout === "grid" || layout === "list") setLayout(layout);
    } catch {}
  }, [viewer.tenants]);
  const tenant = viewer.tenants.find((t) => t.id === tenantId) ?? null;
  const canWrite = !!tenant?.canWrite;
  const canDelete = !!tenant?.canDelete;


  // ── View ──
  const [view, setView] = React.useState<View>({ kind: "home" });
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search.trim(), 300);
  const [sort, setSort] = React.useState<AssetSort>("newest");
  const [layout, setLayout] = React.useState<"grid" | "list">("grid");

  // ── Data ──
  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [total, setTotal] = React.useState(0);
  const [nextOffset, setNextOffset] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [draftFolders, setDraftFolders] = React.useState<string[]>([]);
  const loadController = React.useRef<AbortController | null>(null);

  // ── Interaction ──
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = React.useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(true);
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [menuTarget, setMenuTarget] = React.useState<MenuTarget>({ kind: "background" });
  const [fileDrag, setFileDrag] = React.useState(false);
  const [dropFolder, setDropFolder] = React.useState<string | null>(null);
  const [foldersExpanded, setFoldersExpanded] = React.useState(true);
  const [handoffOpen, setHandoffOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const query = React.useMemo(() => {
    if (q) return { q };
    if (view.kind === "home") return { folder: UNFILED };
    if (view.kind === "type") return { type: view.type };
    if (view.kind === "folder") return { folder: view.folder };
    return {};
  }, [q, view]);

  const listUrl = React.useCallback(
    (offset: number) => {
      const params = new URLSearchParams({ tenantId: tenantId ?? "", sort, offset: String(offset) });
      for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
      return `/api/assets?${params}`;
    },
    [tenantId, sort, query]
  );

  const refreshOverview = React.useCallback(async () => {
    if (!tenantId) return;
    try {
      setOverview(await api<Overview>(`/api/folders?tenantId=${tenantId}`));
    } catch {}
  }, [tenantId]);

  React.useEffect(() => {
    setOverview(null);
    refreshOverview();
  }, [refreshOverview]);

  React.useEffect(() => {
    if (!tenantId) return;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    setLoadError(null);
    api<AssetPage>(listUrl(0), { signal: controller.signal })
      .then((page) => {
        setAssets(page.assets);
        setTotal(page.total);
        setNextOffset(page.nextOffset);
        setSelected(new Set());
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : "Couldn't load files");
        setLoading(false);
      });
    return () => controller.abort();
  }, [tenantId, listUrl, reloadKey]);

  const reload = React.useCallback(() => {
    setReloadKey((k) => k + 1);
    refreshOverview();
  }, [refreshOverview]);

  const loadMore = async () => {
    if (nextOffset == null || loadingMore) return;
    const signal = loadController.current?.signal;
    setLoadingMore(true);
    try {
      const page = await api<AssetPage>(listUrl(nextOffset), { signal });
      setAssets((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...page.assets.filter((a) => !seen.has(a.id))];
      });
      setTotal(page.total);
      setNextOffset(page.nextOffset);
    } catch (err) {
      if (!signal?.aborted) notify.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  // ── Derived ──
  const folderNames = React.useMemo(() => {
    const names = new Set(overview?.folders.map((f) => f.name) ?? []);
    draftFolders.forEach((f) => names.add(f));
    return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [overview, draftFolders]);
  const folderInfo = React.useMemo(() => new Map(overview?.folders.map((f) => [f.name, f]) ?? []), [overview]);
  const assetById = React.useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const selectedIds = React.useMemo(() => assets.filter((a) => selected.has(a.id)).map((a) => a.id), [assets, selected]);
  const single = selectedIds.length === 1 ? assetById.get(selectedIds[0]) ?? null : null;
  const currentFolder = view.kind === "folder" ? view.folder : null;

  const title = q
    ? "Search results"
    : view.kind === "home"
      ? "Home"
      : view.kind === "recent"
        ? "Recent"
        : view.kind === "type"
          ? TYPE_NAV.find((t) => t.type === view.type)!.label
          : view.folder;

  const go = (next: View) => {
    setView(next);
    setSearch("");
    setSelected(new Set());
    setAnchorId(null);
  };

  const switchTenant = (id: string) => {
    setTenantId(id);
    setDraftFolders([]);
    go({ kind: "home" });
    try {
      localStorage.setItem(TENANT_KEY, id);
    } catch {}
  };

  const changeLayout = (value: "grid" | "list") => {
    setLayout(value);
    try {
      localStorage.setItem(LAYOUT_KEY, value);
    } catch {}
  };

  // ── Selection ──
  const selectOnly = (id: string) => {
    setSelected(new Set([id]));
    setAnchorId(id);
  };
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchorId(id);
  };
  const selectAll = () => setSelected(new Set(assets.map((a) => a.id)));
  const clearSelection = () => setSelected(new Set());

  const handleItemClick = (e: React.MouseEvent, asset: Asset, index: number) => {
    e.stopPropagation();
    if (e.shiftKey && anchorId) {
      const anchorIndex = assets.findIndex((a) => a.id === anchorId);
      if (anchorIndex >= 0) {
        const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
        const range = assets.slice(from, to + 1).map((a) => a.id);
        setSelected((prev) => new Set(e.metaKey || e.ctrlKey ? [...Array.from(prev), ...range] : range));
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) return toggle(asset.id);
    selectOnly(asset.id);
  };

  // ── Actions ──
  const openPreview = (id: string) => {
    const index = assets.findIndex((a) => a.id === id);
    if (index >= 0) setPreviewIndex(index);
  };

  const downloadMany = async (ids: string[]) => {
    const list = ids.map((id) => assetById.get(id)).filter((a): a is Asset => !!a);
    if (list.length > 1) notify.info(`Downloading ${plural(list.length, "file")}…`);
    for (const asset of list) {
      await downloadAsset(asset);
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  const copyLinks = async (ids: string[]) => {
    const urls = ids.map((id) => assetById.get(id)?.url).filter(Boolean);
    await navigator.clipboard.writeText(urls.join("\n"));
    notify.success(urls.length === 1 ? "File link copied" : `${urls.length} links copied`);
  };

  const duplicate = async (id: string) => {
    try {
      await api(`/api/assets/${id}/duplicate`, { method: "POST" });
      notify.success("Copy created");
      reload();
    } catch (err) {
      notify.error(err);
    }
  };

  const askDelete = (ids: string[]) => {
    if (!canDelete || !ids.length) return;
    const label = ids.length === 1 ? `“${assetById.get(ids[0])?.name ?? "this file"}”` : plural(ids.length, "file");
    setDialog({ kind: "delete", ids, label });
  };

  const moveTo = async (ids: string[], folder: string | null) => {
    if (!canWrite || !ids.length) return;
    try {
      const { count } = await api<{ count: number }>("/api/assets/bulk", {
        method: "POST",
        body: { tenantId, action: "move", ids, folder },
      });
      handleMoved(ids, folder);
      notify.success(`Moved ${plural(count, "file")} to ${folder ?? "Unfiled"}`);
    } catch (err) {
      notify.error(err);
    }
  };

  const askDeleteFolder = (folder: string) => {
    const count = folderInfo.get(folder)?.count ?? 0;
    if (count === 0) {
      setDraftFolders((d) => d.filter((f) => f !== folder));
      if (currentFolder === folder) go({ kind: "home" });
      return;
    }
    setDialog({ kind: "delete-folder", folder, count });
  };

  // ── Local updates after mutations ──
  const inView = (folder: string | null) => {
    if (q || view.kind === "recent" || view.kind === "type") return true;
    if (view.kind === "home") return folder === null;
    return folder === view.folder;
  };

  const handleUpdated = (updated: Asset) => {
    if (!inView(updated.folder)) {
      setAssets((prev) => prev.filter((a) => a.id !== updated.id));
      setTotal((t) => Math.max(0, t - 1));
      clearSelection();
    } else {
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    }
    refreshOverview();
  };

  const handleMoved = (ids: string[], folder: string | null) => {
    const idSet = new Set(ids);
    if (!inView(folder)) {
      setAssets((prev) => prev.filter((a) => !idSet.has(a.id)));
      setTotal((t) => Math.max(0, t - ids.length));
      clearSelection();
    } else {
      setAssets((prev) => prev.map((a) => (idSet.has(a.id) ? { ...a, folder } : a)));
    }
    if (folder) setDraftFolders((d) => d.filter((f) => f !== folder));
    refreshOverview();
  };

  const handleDeleted = (ids: string[]) => {
    const idSet = new Set(ids);
    setAssets((prev) => prev.filter((a) => !idSet.has(a.id)));
    setTotal((t) => Math.max(0, t - ids.length));
    clearSelection();
    setPreviewIndex(null);
    refreshOverview();
  };

  // ── Uploads ──
  const uploadToast = React.useRef<string | null>(null);
  const { startUpload } = useUploadThing("assetUploader", {
    headers: (): Record<string, string> => {
      const headers: Record<string, string> = { [TENANT_HEADER]: tenantId ?? "" };
      if (currentFolder) headers[FOLDER_HEADER] = encodeURIComponent(currentFolder);
      return headers;
    },
    onUploadProgress: (p) => {
      if (uploadToast.current) notify.update(uploadToast.current, `Uploading… ${Math.round(p)}%`, "loading");
    },
    onClientUploadComplete: (res) => {
      if (uploadToast.current) notify.update(uploadToast.current, `Uploaded ${plural(res.length, "file")}`, "success");
      uploadToast.current = null;
      if (currentFolder) setDraftFolders((d) => d.filter((f) => f !== currentFolder));
      reload();
    },
    onUploadError: (error) => {
      if (uploadToast.current) notify.update(uploadToast.current, error.message || "Upload failed", "error");
      else notify.error(error);
      uploadToast.current = null;
    },
  });

  const uploadFiles = (files: File[]) => {
    if (!canWrite || !files.length) return;
    uploadToast.current = notify.loading(`Uploading ${plural(files.length, "file")}…`);
    startUpload(files);
  };

  // ── Keyboard ──
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || previewIndex != null || isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      } else if (e.key === "Escape") {
        clearSelection();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length) {
        e.preventDefault();
        askDelete(selectedIds);
      } else if (e.key === "Enter" && single) {
        openPreview(single.id);
      } else if (e.key === "F2" && single && canWrite) {
        e.preventDefault();
        setDialog({ kind: "rename", asset: single });
      } else if (e.key === "/") {
        e.preventDefault();
        document.getElementById("folders-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Context-menu targeting (one menu for the whole content area) ──
  const onContentContextMenu = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    const folderEl = el.closest<HTMLElement>("[data-folder-tile]");
    if (folderEl?.dataset.folderTile) {
      setMenuTarget({ kind: "folder", folder: folderEl.dataset.folderTile });
      return;
    }
    const id = el.closest<HTMLElement>("[data-asset-id]")?.dataset.assetId;
    if (!id) {
      setMenuTarget({ kind: "background" });
      return;
    }
    if (selected.has(id)) setMenuTarget({ kind: "assets", ids: selectedIds });
    else {
      selectOnly(id);
      setMenuTarget({ kind: "assets", ids: [id] });
    }
  };

  // ── Drag & drop ──
  const onItemDragStart = (e: React.DragEvent, id: string) => {
    if (!canWrite) return;
    const ids = selected.has(id) ? selectedIds : [id];
    if (!selected.has(id)) selectOnly(id);
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  };

  const dropProps = (target: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!canWrite || !e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropFolder(target ?? UNFILED);
    },
    onDragLeave: () => setDropFolder(null),
    onDrop: (e: React.DragEvent) => {
      setDropFolder(null);
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      moveTo(JSON.parse(raw) as string[], target);
    },
  });

  const signOut = async () => {
    // With Handshake, signing out ends the shared session for every AXXES app
    if (handshakeUrl) {
      window.location.assign(`${handshakeUrl}/sign-out?redirect=${encodeURIComponent(`${window.location.origin}/`)}`);
      return;
    }
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  };


  // ── No workspace ──
  if (!tenant) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border">
          <Logo className="mx-auto mb-6 justify-center" />
          <h1 className="text-xl font-medium">No workspace yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {viewer.email} isn&apos;t a member of any AXXES workspace. Ask a workspace admin to invite you.
          </p>
          <Button variant="outline" className="mt-6 rounded-full" onClick={signOut}>
            <LogOut /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  const showFolderTiles = !q && view.kind === "home" && folderNames.length > 0;
  const showDetails = detailsOpen && single;
  const storage = overview?.storageBytes ?? 0;

  return (
    <div className="flex h-dvh bg-sidebar text-foreground">
      {/* ── Sidebar ── */}
      <aside data-collapsed={sidebarCollapsed} className={cn("group/sidebar hidden shrink-0 flex-col px-3 pb-3 transition-[width] md:flex", sidebarCollapsed ? "w-16" : "w-64")} aria-label="Navigation">
        <div className="flex h-16 items-center px-3">
          <div className={cn(sidebarCollapsed && "hidden")}><Logo /></div>
          <button type="button" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setSidebarCollapsed(x => !x)} className="ml-auto rounded-full p-1 hover:bg-muted"><PanelLeft className="size-4" /></button>
        </div>
        {canWrite && !sidebarCollapsed && (
          <NewMenu
            onUpload={() => fileInputRef.current?.click()}
            onAddUrl={() => setDialog({ kind: "add-url", folder: currentFolder })}
            onNewFolder={() => setDialog({ kind: "new-folder" })}
            onHandoff={() => setHandoffOpen(true)}
          />
        )}
        <nav className="mt-4 flex-1 overflow-y-auto text-sm">
          <NavItem icon={Home} label="Home" active={!q && view.kind === "home"} onClick={() => go({ kind: "home" })} {...dropProps(null)} dropActive={dropFolder === UNFILED} />
          <NavItem icon={Clock} label="Recent" active={!q && view.kind === "recent"} onClick={() => go({ kind: "recent" })} count={overview?.counts.all} />
          {TYPE_NAV.map((t) => (
            <NavItem
              key={t.type}
              icon={t.icon}
              label={t.label}
              active={!q && view.kind === "type" && view.type === t.type}
              onClick={() => go({ kind: "type", type: t.type })}
              count={overview?.counts[t.type as "image" | "video" | "document"]}
            />
          ))}

          <button
            type="button"
            className="mt-4 flex w-full items-center gap-1 px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setFoldersExpanded((x) => !x)}
            aria-expanded={foldersExpanded}
          >
            <ChevronRight className={cn("size-3.5 transition-transform", foldersExpanded && "rotate-90")} />
            <span className="group-data-[collapsed=true]/sidebar:hidden">Folders</span>
          </button>
          {foldersExpanded &&
            folderNames.map((name) => (
              <NavItem
                key={name}
                icon={currentFolder === name ? FolderOpen : Folder}
                iconClassName="fill-folder/25 text-folder"
                label={name}
                active={!q && currentFolder === name}
                onClick={() => go({ kind: "folder", folder: name })}
                count={folderInfo.get(name)?.count ?? 0}
                dropActive={dropFolder === name}
                {...dropProps(name)}
              />
            ))}
          {foldersExpanded && overview && folderNames.length === 0 && (
            <p className="px-4 py-1 text-xs text-muted-foreground">No folders yet</p>
          )}
        </nav>
        <OrganizationMenu viewer={viewer} tenantId={tenant.id} tenantName={tenant.name} switchTenant={switchTenant} collapsed={sidebarCollapsed} />
        <div className={cn("mt-2 px-4 text-xs text-muted-foreground", sidebarCollapsed && "hidden")}>
          <div className="flex items-center gap-2">
            <HardDrive className="size-4" />
            <span>{overview ? `${formatBytes(storage)} in ${plural(overview.counts.all, "file")}` : "…"}</span>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex min-w-0 flex-1 flex-col pb-3 pr-3 max-md:pl-3">
        <header className="flex h-16 shrink-0 items-center gap-3">
          <Logo className="md:hidden" compact />
          <div className="relative w-full max-w-2xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="folders-search"
              type="search"
              placeholder="Search in Folders"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 w-full rounded-full bg-secondary pl-12 pr-10 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus:bg-card focus:shadow-md focus:ring-1 focus:ring-border [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 hover:bg-muted" aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="md:hidden"><OrganizationMenu viewer={viewer} tenantId={tenant.id} tenantName={tenant.name} switchTenant={switchTenant} collapsed /></div>
            <AccountMenu viewer={viewer} tenantId={tenant.id} tenantName={tenant.name} role={tenant.role} onSignOut={signOut} switchTenant={switchTenant} accountUrl={handshakeUrl} />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-3">
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
            {/* Title row or selection bar */}
            {selectedIds.length > 1 || (selectedIds.length === 1 && !showDetails) ? (
              <div className="m-3 flex h-12 shrink-0 items-center gap-1 rounded-full bg-accent px-2 text-sm text-accent-foreground">
                <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={clearSelection} aria-label="Clear selection">
                  <X />
                </Button>
                <span className="mr-3 font-medium">{selectedIds.length} selected</span>
                <IconAction label="Download" onClick={() => downloadMany(selectedIds)}><Download /></IconAction>
                {canWrite && <IconAction label="Move" onClick={() => setDialog({ kind: "move", ids: selectedIds })}><FolderInput /></IconAction>}
                {canWrite && <IconAction label="Add tags" onClick={() => setDialog({ kind: "tags", ids: selectedIds })}><Tag /></IconAction>}
                <IconAction label="Copy links" onClick={() => copyLinks(selectedIds)}><Link2 /></IconAction>
                {canDelete && <IconAction label="Delete" onClick={() => askDelete(selectedIds)}><Trash2 /></IconAction>}
              </div>
            ) : (
              <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pb-2 pt-5">
                <h1 className="flex min-w-0 items-center gap-1 text-2xl">
                  {view.kind === "folder" && !q && (
                    <>
                      <button type="button" className="rounded-full px-2 py-0.5 text-muted-foreground hover:bg-muted" onClick={() => go({ kind: "home" })}>
                        Home
                      </button>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                    </>
                  )}
                  <span className="truncate px-2">{title}</span>
                </h1>
                <div className="ml-auto flex items-center gap-1">
                  <SortMenu sort={sort} onChange={setSort} />
                  <div className="flex rounded-full border border-border p-0.5">
                    <button type="button" onClick={() => changeLayout("list")} className={cn("rounded-full px-3 py-1.5", layout === "list" && "bg-accent text-accent-foreground")} aria-label="List layout">
                      <List className="size-4" />
                    </button>
                    <button type="button" onClick={() => changeLayout("grid")} className={cn("rounded-full px-3 py-1.5", layout === "grid" && "bg-accent text-accent-foreground")} aria-label="Grid layout">
                      <LayoutGrid className="size-4" />
                    </button>
                  </div>
                  <Button variant="ghost" size="icon" className={cn("rounded-full", detailsOpen && "bg-accent")} onClick={() => setDetailsOpen((x) => !x)} aria-label="Toggle details">
                    <Info />
                  </Button>
                </div>
              </div>
            )}

            {/* Content */}
            <ContextMenu>
              <ContextMenuTrigger
                className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-6"
                onClick={clearSelection}
                onContextMenu={onContentContextMenu}
                onDragOver={(e: React.DragEvent) => {
                  if (!canWrite || !e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  setFileDrag(true);
                }}
                onDragLeave={(e: React.DragEvent) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileDrag(false);
                }}
                onDrop={(e: React.DragEvent) => {
                  if (!e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  setFileDrag(false);
                  uploadFiles(Array.from(e.dataTransfer.files));
                }}
              >
                {fileDrag && (
                  <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-accent/80">
                    <UploadCloud className="mb-2 size-12 text-primary" />
                    <p className="font-medium">Drop files to upload to {currentFolder ?? "Home"}</p>
                  </div>
                )}

                {showFolderTiles && (
                  <div className="mb-6">
                    <h2 className="mb-3 mt-2 text-sm font-medium">Folders</h2>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                      {folderNames.map((name) => (
                        <FolderTile
                          key={name}
                          name={name}
                          count={folderInfo.get(name)?.count ?? 0}
                          previews={folderInfo.get(name)?.previews ?? []}
                          dropActive={dropFolder === name}
                          onOpen={() => go({ kind: "folder", folder: name })}
                          {...dropProps(name)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {loadError ? (
                  <Empty icon={AlertTriangle} title="Couldn't load files" body={loadError}>
                    <Button variant="outline" className="rounded-full" onClick={reload}>Try again</Button>
                  </Empty>
                ) : loading && assets.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-muted-foreground">
                    <Loader2 className="size-6 animate-spin" />
                  </div>
                ) : assets.length === 0 ? (
                  showFolderTiles ? null : (
                    <Empty
                      icon={q ? Search : view.kind === "folder" ? FolderOpen : Inbox}
                      title={q ? "No results" : view.kind === "folder" ? "This folder is empty" : "No files here yet"}
                      body={q ? "Try different keywords." : canWrite ? "Drop files here or use the New button." : undefined}
                    >
                      {canWrite && !q && (
                        <Button className="rounded-full" onClick={() => fileInputRef.current?.click()}>
                          <Upload /> Upload files
                        </Button>
                      )}
                    </Empty>
                  )
                ) : (
                  <div className={cn(loading && "opacity-60")}>
                    {showFolderTiles && <h2 className="mb-3 text-sm font-medium">Files</h2>}
                    {layout === "grid" ? (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                        {assets.map((asset, index) => (
                          <FileCard
                            key={asset.id}
                            asset={asset}
                            selected={selected.has(asset.id)}
                            selecting={selected.size > 0}
                            draggable={canWrite}
                            onClick={(e) => handleItemClick(e, asset, index)}
                            onDoubleClick={() => openPreview(asset.id)}
                            onToggle={() => toggle(asset.id)}
                            onDragStart={(e) => onItemDragStart(e, asset.id)}
                          />
                        ))}
                      </div>
                    ) : (
                      <FileTable
                        assets={assets}
                        selected={selected}
                        draggable={canWrite}
                        showFolder={view.kind !== "folder" && view.kind !== "home"}
                        onItemClick={handleItemClick}
                        onOpen={openPreview}
                        onToggle={toggle}
                        onDragStart={onItemDragStart}
                      />
                    )}
                    {nextOffset != null && (
                      <div className="mt-6 flex justify-center">
                        <Button variant="outline" className="rounded-full" onClick={(e) => { e.stopPropagation(); loadMore(); }} disabled={loadingMore}>
                          {loadingMore && <Loader2 className="animate-spin" />}
                          Show more ({(total - assets.length).toLocaleString()} more)
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </ContextMenuTrigger>

              <ContextMenuContent className="min-w-56">
                {menuTarget.kind === "assets" && menuTarget.ids.length > 0 ? (
                  <AssetMenu
                    ids={menuTarget.ids}
                    asset={menuTarget.ids.length === 1 ? assetById.get(menuTarget.ids[0]) ?? null : null}
                    folders={folderNames}
                    currentFolder={currentFolder}
                    canWrite={canWrite}
                    canDelete={canDelete}
                    onPreview={openPreview}
                    onDetails={(id) => { selectOnly(id); setDetailsOpen(true); }}
                    onDownload={downloadMany}
                    onCopyLinks={copyLinks}
                    onShare={(a) => setDialog({ kind: "share", target: { kind: "asset", id: a.id, name: a.name } })}
                    onRename={(a) => setDialog({ kind: "rename", asset: a })}
                    onMoveTo={moveTo}
                    onMoveNewFolder={(ids) => setDialog({ kind: "new-folder", moveIds: ids })}
                    onTag={(ids) => setDialog({ kind: "tags", ids })}
                    onDuplicate={duplicate}
                    onDelete={askDelete}
                    tenantId={tenantId}
                  />
                ) : menuTarget.kind === "folder" ? (
                  <>
                    <ContextMenuGroup><ContextMenuLabel className="max-w-64 truncate">{menuTarget.folder}</ContextMenuLabel></ContextMenuGroup>
                    <ContextMenuItem onClick={() => go({ kind: "folder", folder: menuTarget.folder })}>
                      <FolderOpen /> Open
                    </ContextMenuItem>
                    {canWrite && (
                      <>
                        <ContextMenuItem onClick={() => setDialog({ kind: "share", target: { kind: "folder", folder: menuTarget.folder } })}>
                          <Share2 /> Share
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem disabled={!folderInfo.get(menuTarget.folder)?.count} onClick={() => setDialog({ kind: "rename-folder", folder: menuTarget.folder })}>
                          <FolderPen /> Rename
                        </ContextMenuItem>
                        <ContextMenuItem variant="destructive" onClick={() => askDeleteFolder(menuTarget.folder)}>
                          <Trash2 /> Delete folder
                        </ContextMenuItem>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <ContextMenuItem disabled={!canWrite} onClick={() => setDialog({ kind: "new-folder" })}>
                      <FolderPlus /> New folder
                    </ContextMenuItem>
                    <ContextMenuItem disabled={!canWrite} onClick={() => fileInputRef.current?.click()}>
                      <Upload /> Upload files
                    </ContextMenuItem>
                    <ContextMenuItem disabled={!canWrite} onClick={() => setDialog({ kind: "add-url", folder: currentFolder })}>
                      <Link2 /> Add from link
                    </ContextMenuItem>
                    {currentFolder && canWrite && (
                      <ContextMenuItem onClick={() => setDialog({ kind: "share", target: { kind: "folder", folder: currentFolder } })}>
                        <Share2 /> Share this folder
                      </ContextMenuItem>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem disabled={!assets.length} onClick={selectAll}>
                      <SquareCheck /> Select all <ContextMenuShortcut>⌘A</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger><ArrowDownUp /> Sort by</ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        {SORTS.map((s) => (
                          <ContextMenuItem key={s.value} onClick={() => setSort(s.value)}>
                            {s.label} {sort === s.value && <Check className="ml-auto" />}
                          </ContextMenuItem>
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuItem onClick={() => changeLayout(layout === "grid" ? "list" : "grid")}>
                      {layout === "grid" ? <List /> : <LayoutGrid />} {layout === "grid" ? "List layout" : "Grid layout"}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={reload}>
                      <RefreshCw /> Refresh
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          </section>

          {showDetails && (
            <DetailsPanel
              asset={single}
              folders={folderNames}
              canWrite={canWrite}
              canDelete={canDelete}
              onClose={() => setDetailsOpen(false)}
              onSaved={handleUpdated}
              onPreview={() => openPreview(single.id)}
              onShare={() => setDialog({ kind: "share", target: { kind: "asset", id: single.id, name: single.name } })}
              onDelete={() => askDelete([single.id])}
            />
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          uploadFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <FolderDialogs
        state={dialog}
        tenantId={tenant.id}
        folders={folderNames}
        canDelete={canDelete}
        onClose={() => setDialog(null)}
        onAssetUpdated={handleUpdated}
        onAssetsMoved={handleMoved}
        onAssetsDeleted={handleDeleted}
        onChanged={reload}
        onFolderCreated={(name, saved) => {
          // A folder only exists once it holds files; until then keep a local placeholder
          if (!saved && !folderNames.includes(name)) setDraftFolders((d) => [...d, name]);
          go({ kind: "folder", folder: name });
          if (saved) refreshOverview();
        }}
        onFolderRenamed={(from, to) => {
          setDraftFolders((d) => d.filter((f) => f !== from));
          if (currentFolder === from) go({ kind: "folder", folder: to });
          reload();
        }}
        onFolderDeleted={(name) => {
          setDraftFolders((d) => d.filter((f) => f !== name));
          if (currentFolder === name) go({ kind: "home" });
          reload();
        }}
      />

      <Preview assets={assets} index={previewIndex} onIndexChange={setPreviewIndex} onClose={() => setPreviewIndex(null)} />
      {handoffOpen && (
        <PhotoHandoffDialog
          tenantId={tenant.id}
          folder={currentFolder}
          onDone={reload}
          onClose={() => setHandoffOpen(false)}
        />
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────

function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  const brand = React.useContext(BrandContext);
  if (brand) {
    const src = brand.iconUrl ?? brand.logoUrl;
    return (
      <div className={cn("flex items-center gap-2.5", className)}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-9 rounded-md bg-white object-contain" />
        ) : (
          <Folder className="size-9 fill-folder text-folder-tab" strokeWidth={1.5} />
        )}
        {!compact && (
          <span className="leading-tight">
            <span className="block text-[22px] tracking-tight text-foreground/80">Folders</span>
            <span className="block text-xs text-muted-foreground">{brand.name} · Powered by AXXES</span>
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative size-9">
        <Folder className="size-9 fill-folder text-folder-tab" strokeWidth={1.5} />
      </div>
      {!compact && (
        <span className="text-[22px] tracking-tight text-foreground/80">
          Folders <span className="text-sm font-medium text-muted-foreground">by AXXES</span>
        </span>
      )}
    </div>
  );
}

function NewMenu({ onUpload, onAddUrl, onNewFolder, onHandoff }: { onUpload: () => void; onAddUrl: () => void; onNewFolder: () => void; onHandoff: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex h-14 w-fit items-center gap-3 rounded-2xl bg-card pl-4 pr-6 text-sm font-medium shadow-md ring-1 ring-border transition-shadow hover:bg-accent hover:shadow-lg"
          />
        }
      >
        <Plus className="size-6" /> New
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuItem onClick={onNewFolder}><FolderPlus /> New folder</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onUpload}><Upload /> File upload</DropdownMenuItem>
        <DropdownMenuItem onClick={onHandoff}><Smartphone className="size-4" /> Upload from phone</DropdownMenuItem>
        <DropdownMenuItem onClick={onAddUrl}><Link2 /> Add from link</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavItem({
  icon: Icon,
  iconClassName,
  label,
  active,
  onClick,
  count,
  dropActive,
  ...drop
}: {
  icon: React.ElementType;
  iconClassName?: string;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  dropActive?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0 flex h-9 w-full items-center gap-4 rounded-full px-4 text-left transition-colors hover:bg-muted",
        active && "bg-accent font-medium text-accent-foreground hover:bg-accent",
        dropActive && "bg-primary text-primary-foreground hover:bg-primary"
      )}
      {...drop}
    >
      <Icon className={cn("size-[18px] shrink-0", !dropActive && iconClassName)} />
      <span className="flex-1 truncate group-data-[collapsed=true]/sidebar:hidden">{label}</span>
      {count !== undefined && count > 0 && <span className="text-xs tabular-nums text-muted-foreground group-data-[collapsed=true]/sidebar:hidden">{count.toLocaleString()}</span>}
    </button>
  );
}

function AccountMenu({ viewer, tenantId, tenantName, role, onSignOut, switchTenant, accountUrl }: { viewer: Viewer; tenantId: string; tenantName: string; role: string; onSignOut: () => void; switchTenant: (id: string) => void; accountUrl: string | null }) {
  const initials = (viewer.name || viewer.email).split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" className="rounded-full p-1 hover:bg-muted" aria-label="Account" />}
      >
        {viewer.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewer.image} alt="" className="size-8 rounded-full object-cover" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="px-3 py-3">
          <p className="truncate font-medium">{viewer.name}</p>
          <p className="truncate text-sm text-muted-foreground">{viewer.email}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {tenantName} · <span className="capitalize">{role}</span>
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.open(PORTAL_URL, "_blank", "noopener,noreferrer")}>
          <ExternalLink /> Open in members portal
        </DropdownMenuItem>
        {accountUrl && (
          <DropdownMenuItem onClick={() => window.open(accountUrl, "_blank", "noopener,noreferrer")}>
            <UserCog /> Manage your AXXES account
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortMenu({ sort, onChange }: { sort: AssetSort; onChange: (s: AssetSort) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm hover:bg-muted" />}
      >
        <ArrowDownUp className="size-4" /> {SORTS.find((s) => s.value === sort)?.label} <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {SORTS.map((s) => (
          <DropdownMenuItem key={s.value} onClick={() => onChange(s.value)}>
            {s.label} {sort === s.value && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="rounded-full p-2 hover:bg-background/60 [&_svg]:size-[18px]">
      {children}
    </button>
  );
}

function FolderTile({
  name,
  count,
  previews,
  dropActive,
  onOpen,
  ...drop
}: {
  name: string;
  count: number;
  previews: string[];
  dropActive: boolean;
  onOpen: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <div
      data-folder-tile={name}
      role="button"
      tabIndex={0}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "group cursor-default select-none overflow-hidden rounded-xl bg-secondary transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        dropActive && "bg-primary/15 ring-2 ring-primary"
      )}
      {...drop}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex h-20 gap-1 p-2 pb-0">
          {previews.length > 0 ? (
            previews.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" loading="lazy" draggable={false} className="h-full min-w-0 flex-1 rounded-t-lg object-cover" />
            ))
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-t-lg bg-card/60">
              <Folder className="size-10 fill-folder/30 text-folder" strokeWidth={1.5} />
            </div>
          )}
        </div>
      </button>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Folder className="size-5 shrink-0 fill-folder/30 text-folder" />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium" title={name}>{name}</p>
          <p className="text-xs text-muted-foreground">{plural(count, "file")}</p>
        </button>
        <button
          type="button"
          aria-label={`More actions for ${name}`}
          className="rounded-full p-1.5 opacity-0 hover:bg-background/60 group-hover:opacity-100 focus:opacity-100"
          onClick={(e) => { e.stopPropagation(); openMenuAt(e.currentTarget); }}
        >
          <MoreVertical className="size-4" />
        </button>
      </div>
    </div>
  );
}

function FileCard({
  asset,
  selected,
  selecting,
  draggable,
  onClick,
  onDoubleClick,
  onToggle,
  onDragStart,
}: {
  asset: Asset;
  selected: boolean;
  selecting: boolean;
  draggable: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onToggle: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <div
      data-asset-id={asset.id}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "group flex cursor-default select-none flex-col rounded-xl bg-secondary p-2 pt-0 outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-accent ring-2 ring-primary/60 hover:bg-accent"
      )}
    >
      <div className="flex h-11 items-center gap-2.5 pl-1.5">
        <div className="relative size-5 shrink-0">
          <TypeIcon asset={asset} className={cn("size-5 transition-opacity", (selected || selecting) ? "opacity-0" : "group-hover:opacity-0")} />
          <div
            className={cn("absolute inset-0 flex items-center justify-center transition-opacity", selected || selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            <Checkbox checked={selected} aria-label={`Select ${asset.name}`} />
          </div>
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={asset.name}>{asset.name}</p>
        <button
          type="button"
          aria-label={`More actions for ${asset.name}`}
          className="rounded-full p-1.5 hover:bg-background/60"
          onClick={(e) => { e.stopPropagation(); openMenuAt(e.currentTarget); }}
        >
          <MoreVertical className="size-4" />
        </button>
      </div>
      <div className="aspect-[4/3] overflow-hidden rounded-lg bg-card">
        <Thumb asset={asset} />
      </div>
    </div>
  );
}

function FileTable({
  assets,
  selected,
  draggable,
  showFolder,
  onItemClick,
  onOpen,
  onToggle,
  onDragStart,
}: {
  assets: Asset[];
  selected: Set<string>;
  draggable: boolean;
  showFolder: boolean;
  onItemClick: (e: React.MouseEvent, asset: Asset, index: number) => void;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
}) {
  const cols = showFolder
    ? "grid-cols-[minmax(0,1fr)_160px_130px_90px_40px] max-lg:grid-cols-[minmax(0,1fr)_90px_40px]"
    : "grid-cols-[minmax(0,1fr)_130px_90px_40px] max-lg:grid-cols-[minmax(0,1fr)_90px_40px]";
  return (
    <div className="text-sm" role="listbox" aria-multiselectable>
      <div className={cn("grid items-center gap-4 border-b px-3 py-2.5 text-[13px] font-medium text-muted-foreground", cols)}>
        <span>Name</span>
        {showFolder && <span className="max-lg:hidden">Location</span>}
        <span className="max-lg:hidden">Added</span>
        <span>Size</span>
        <span />
      </div>
      {assets.map((asset, index) => {
        const isSelected = selected.has(asset.id);
        return (
          <div
            key={asset.id}
            data-asset-id={asset.id}
            role="option"
            aria-selected={isSelected}
            tabIndex={0}
            draggable={draggable}
            onDragStart={(e) => onDragStart(e, asset.id)}
            onClick={(e) => onItemClick(e, asset, index)}
            onDoubleClick={() => onOpen(asset.id)}
            className={cn(
              "group grid cursor-default select-none items-center gap-4 rounded-lg border-b border-border/60 px-3 py-2 outline-none hover:bg-muted focus-visible:bg-muted",
              cols,
              isSelected && "bg-accent hover:bg-accent"
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="relative size-5 shrink-0"
                onClick={(e) => { e.stopPropagation(); onToggle(asset.id); }}
              >
                <TypeIcon asset={asset} className={cn("size-5", isSelected ? "opacity-0" : "group-hover:opacity-0")} />
                <div className={cn("absolute inset-0 flex items-center justify-center", isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                  <Checkbox checked={isSelected} aria-label={`Select ${asset.name}`} />
                </div>
              </div>
              <span className="truncate font-medium" title={asset.name}>{asset.name}</span>
              {asset.tags.slice(0, 2).map((t) => (
                <span key={t} className="hidden shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground xl:inline">{t}</span>
              ))}
            </div>
            {showFolder && <span className="truncate text-muted-foreground max-lg:hidden">{asset.folder ?? "Home"}</span>}
            <span className="text-muted-foreground max-lg:hidden">{format(new Date(asset.createdAt), "MMM d, yyyy")}</span>
            <span className="text-muted-foreground">{formatBytes(asset.size)}</span>
            <button
              type="button"
              aria-label={`More actions for ${asset.name}`}
              className="rounded-full p-1.5 opacity-0 hover:bg-background/60 group-hover:opacity-100 focus:opacity-100"
              onClick={(e) => { e.stopPropagation(); openMenuAt(e.currentTarget); }}
            >
              <MoreVertical className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AssetMenu({
  ids,
  asset,
  folders,
  currentFolder,
  canWrite,
  canDelete,
  onPreview,
  onDetails,
  onDownload,
  onCopyLinks,
  onShare,
  onRename,
  onMoveTo,
  onMoveNewFolder,
  onTag,
  onDuplicate,
  onDelete,
  tenantId,
}: {
  ids: string[];
  asset: Asset | null;
  tenantId: string | null;
  folders: string[];
  currentFolder: string | null;
  canWrite: boolean;
  canDelete: boolean;
  onPreview: (id: string) => void;
  onDetails: (id: string) => void;
  onDownload: (ids: string[]) => void;
  onCopyLinks: (ids: string[]) => void;
  onShare: (asset: Asset) => void;
  onRename: (asset: Asset) => void;
  onMoveTo: (ids: string[], folder: string | null) => void;
  onMoveNewFolder: (ids: string[]) => void;
  onTag: (ids: string[]) => void;
  onDuplicate: (id: string) => void;
  onDelete: (ids: string[]) => void;
}) {
  const multi = ids.length > 1;
  return (
    <>
      <ContextMenuGroup><ContextMenuLabel className="max-w-64 truncate">{asset ? asset.name : `${ids.length} files selected`}</ContextMenuLabel></ContextMenuGroup>
      {asset && (
        <>
          <ContextMenuItem onClick={() => onPreview(asset.id)}>
            <Eye /> Preview <ContextMenuShortcut>↵</ContextMenuShortcut>
          </ContextMenuItem>
          {asset.appLinks?.map((link) => {
            const target = appTarget(link.appKey);
            if (!target) return null;
            return (
              <ContextMenuItem key={link.appKey} onClick={() => openApp(target.url(link.recordId, tenantId))}>
                <FilePen /> Open in {target.name}
              </ContextMenuItem>
            );
          })}
          {officeTarget && !(asset.appLinks ?? []).some((l) => l.appKey === "office") && canOpenInOffice(asset) && (
            <ContextMenuItem
              onClick={() => openApp(officeTarget.openUnlinked!(asset.id, tenantId))}
            >
              <FilePen /> Open in {officeTarget.name}
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => window.open(asset.url, "_blank", "noopener,noreferrer")}>
            <ExternalLink /> Open in new tab
          </ContextMenuItem>
        </>
      )}
      <ContextMenuItem onClick={() => onDownload(ids)}>
        <Download /> Download{multi ? ` ${ids.length} files` : ""}
      </ContextMenuItem>
      {canWrite && (
        <>
          <ContextMenuSeparator />
          {asset && (
            <ContextMenuItem onClick={() => onRename(asset)}>
              <Pencil /> Rename <ContextMenuShortcut>F2</ContextMenuShortcut>
            </ContextMenuItem>
          )}
          {asset && (
            <ContextMenuItem onClick={() => onDuplicate(asset.id)}>
              <CopyPlus /> Make a copy
            </ContextMenuItem>
          )}
          {asset && (
            <ContextMenuItem onClick={() => onShare(asset)}>
              <Share2 /> Share
            </ContextMenuItem>
          )}
        </>
      )}
      <ContextMenuItem onClick={() => onCopyLinks(ids)}>
        <Copy /> Copy {multi ? "links" : "link"}
      </ContextMenuItem>
      {canWrite && (
        <>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger><FolderInput /> Move to</ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-80 overflow-y-auto">
              <ContextMenuItem disabled={currentFolder === null && !!asset && asset.folder === null} onClick={() => onMoveTo(ids, null)}>
                <Home /> Home (unfiled)
              </ContextMenuItem>
              {folders.map((f) => (
                <ContextMenuItem key={f} disabled={currentFolder === f} onClick={() => onMoveTo(ids, f)}>
                  <Folder className="fill-folder/30 text-folder" /> <span className="max-w-48 truncate">{f}</span>
                </ContextMenuItem>
              ))}
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onMoveNewFolder(ids)}>
                <FolderPlus /> New folder…
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onClick={() => onTag(ids)}>
            <Tag /> Add tags
          </ContextMenuItem>
        </>
      )}
      {asset && (
        <ContextMenuItem onClick={() => onDetails(asset.id)}>
          <Info /> File information
        </ContextMenuItem>
      )}
      {canDelete && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => onDelete(ids)}>
            <Trash2 /> Delete{multi ? ` ${ids.length} files` : ""} <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </>
      )}
    </>
  );
}

function Empty({ icon: Icon, title, body, children }: { icon: React.ElementType; title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-80 flex-col items-center justify-center gap-2 text-center">
      <div className="mb-3 flex size-20 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-9 text-muted-foreground" />
      </div>
      <p className="text-lg">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {children && <div className="mt-3" onClick={(e) => e.stopPropagation()}>{children}</div>}
    </div>
  );
}

function OrganizationMenu({ viewer, tenantId, tenantName, switchTenant, collapsed }: { viewer: Viewer; tenantId: string; tenantName: string; switchTenant: (id: string) => void; collapsed: boolean }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<button type="button" aria-label={`Switch organization (${tenantName})`} className="mt-3 flex w-full items-center gap-2 rounded-full p-2 text-sm hover:bg-muted" />}>
      <Building2 className="size-4 shrink-0" />{!collapsed && <span className="truncate">{tenantName}</span>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-64">
      <div className="px-3 py-2 text-xs text-muted-foreground">Organizations</div>
      {viewer.tenants.map(t => <DropdownMenuItem key={t.id} onClick={() => switchTenant(t.id)}>{t.id === tenantId && <Check className="size-4" />}{t.name}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>
}
