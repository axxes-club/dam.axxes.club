"use client";

import * as React from "react";
import { Check, Copy, Folder, FolderPlus, Inbox, Link2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Asset } from "@/lib/types";
import { api, notify, plural } from "./utils";

export type ShareTarget = { kind: "asset"; id: string; name: string } | { kind: "folder"; folder: string };

export type DialogState =
  | { kind: "rename"; asset: Asset }
  | { kind: "move"; ids: string[] }
  | { kind: "tags"; ids: string[] }
  | { kind: "delete"; ids: string[]; label: string }
  | { kind: "share"; target: ShareTarget }
  | { kind: "add-url"; folder: string | null }
  | { kind: "new-folder"; moveIds?: string[] }
  | { kind: "rename-folder"; folder: string }
  | { kind: "delete-folder"; folder: string; count: number }
  | null;

export interface DialogsProps {
  state: DialogState;
  tenantId: string;
  folders: string[];
  canDelete: boolean;
  onClose: () => void;
  onAssetUpdated: (asset: Asset) => void;
  onAssetsMoved: (ids: string[], folder: string | null) => void;
  onAssetsDeleted: (ids: string[]) => void;
  onChanged: () => void;
  onFolderCreated: (name: string, saved: boolean) => void;
  onFolderRenamed: (from: string, to: string) => void;
  onFolderDeleted: (name: string) => void;
}

export function FolderDialogs(props: DialogsProps) {
  const { state, onClose } = props;
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      {state && (
        <DialogContent className="sm:max-w-md" onContextMenu={(e) => e.stopPropagation()}>
          {state.kind === "rename" && <RenameAsset {...props} asset={state.asset} />}
          {state.kind === "move" && <MoveAssets {...props} ids={state.ids} />}
          {state.kind === "tags" && <TagAssets {...props} ids={state.ids} />}
          {state.kind === "delete" && <DeleteAssets {...props} ids={state.ids} label={state.label} />}
          {state.kind === "share" && <ShareLink tenantId={props.tenantId} target={state.target} />}
          {state.kind === "add-url" && <AddFromUrl {...props} folder={state.folder} />}
          {state.kind === "new-folder" && <NewFolder {...props} moveIds={state.moveIds} />}
          {state.kind === "rename-folder" && <RenameFolder {...props} folder={state.folder} />}
          {state.kind === "delete-folder" && <DeleteFolder {...props} folder={state.folder} count={state.count} />}
        </DialogContent>
      )}
    </Dialog>
  );
}

function useSubmit() {
  const [pending, setPending] = React.useState(false);
  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    try {
      await fn();
    } catch (err) {
      notify.error(err);
    } finally {
      setPending(false);
    }
  };
  return { pending, run };
}

function Submit({ pending, disabled, destructive, children }: { pending: boolean; disabled?: boolean; destructive?: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending || disabled}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

function Cancel({ onClose }: { onClose: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClose}>
      Cancel
    </Button>
  );
}

// ── Files ────────────────────────────────────────────────────────────────

function RenameAsset({ asset, onClose, onAssetUpdated }: DialogsProps & { asset: Asset }) {
  const [name, setName] = React.useState(asset.name);
  const { pending, run } = useSubmit();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          onAssetUpdated(await api<Asset>(`/api/assets/${asset.id}`, { method: "PATCH", body: { name } }));
          notify.success("Renamed");
          onClose();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Rename</DialogTitle>
      </DialogHeader>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} />
      <DialogFooter>
        <Cancel onClose={onClose} />
        <Submit pending={pending} disabled={!name.trim() || name === asset.name}>Rename</Submit>
      </DialogFooter>
    </form>
  );
}

function MoveAssets({ ids, tenantId, folders, onClose, onAssetsMoved }: DialogsProps & { ids: string[] }) {
  const [target, setTarget] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"pick" | "new">(folders.length ? "pick" : "new");
  const [newName, setNewName] = React.useState("");
  const { pending, run } = useSubmit();
  const destination = mode === "new" ? newName.trim() || null : target;

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "new" && !newName.trim()) return;
        run(async () => {
          const { count } = await api<{ count: number }>("/api/assets/bulk", {
            method: "POST",
            body: { tenantId, action: "move", ids, folder: destination },
          });
          onAssetsMoved(ids, destination);
          notify.success(`Moved ${plural(count, "file")} to ${destination ?? "Unfiled"}`);
          onClose();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Move {plural(ids.length, "file")}</DialogTitle>
        <DialogDescription>Pick a destination folder.</DialogDescription>
      </DialogHeader>
      <div className="max-h-72 overflow-y-auto rounded-lg border p-1">
        <Option active={mode === "pick" && target === null} onClick={() => { setMode("pick"); setTarget(null); }}>
          <Inbox /> Unfiled
        </Option>
        {folders.map((f) => (
          <Option key={f} active={mode === "pick" && target === f} onClick={() => { setMode("pick"); setTarget(f); }}>
            <Folder className="fill-folder/30 text-folder" /> <span className="truncate">{f}</span>
          </Option>
        ))}
        <Option active={mode === "new"} onClick={() => setMode("new")}>
          <FolderPlus /> New folder…
        </Option>
      </div>
      {mode === "new" && <Input autoFocus placeholder="New folder name" value={newName} onChange={(e) => setNewName(e.target.value)} />}
      <DialogFooter>
        <Cancel onClose={onClose} />
        <Submit pending={pending} disabled={mode === "new" && !newName.trim()}>Move</Submit>
      </DialogFooter>
    </form>
  );
}

function Option({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted [&_svg]:size-4 [&_svg]:shrink-0",
        active && "bg-accent font-medium text-accent-foreground hover:bg-accent"
      )}
    >
      {children}
      {active && <Check className="ml-auto text-primary" />}
    </button>
  );
}

function TagAssets({ ids, tenantId, onClose, onChanged }: DialogsProps & { ids: string[] }) {
  const [tags, setTags] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const { pending, run } = useSubmit();

  React.useEffect(() => {
    api<{ tags: string[] }>(`/api/tags?tenantId=${tenantId}`).then((r) => setSuggestions(r.tags)).catch(() => {});
  }, [tenantId]);

  const add = (value: string) => {
    const tag = value.trim().toLowerCase();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setDraft("");
  };
  const visible = suggestions.filter((t) => !tags.includes(t) && t.includes(draft.trim().toLowerCase())).slice(0, 12);

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) return add(draft);
        run(async () => {
          const { count } = await api<{ count: number }>("/api/assets/bulk", {
            method: "POST",
            body: { tenantId, action: "tag", ids, tags },
          });
          notify.success(`Tagged ${plural(count, "file")}`);
          onChanged();
          onClose();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Add tags</DialogTitle>
        <DialogDescription>Added to {plural(ids.length, "file")}. Existing tags are kept.</DialogDescription>
      </DialogHeader>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs text-accent-foreground">
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input autoFocus placeholder="Type a tag and press Enter" value={draft} onChange={(e) => setDraft(e.target.value)} />
      {visible.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visible.map((t) => (
            <button key={t} type="button" onClick={() => add(t)} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted">
              + {t}
            </button>
          ))}
        </div>
      )}
      <DialogFooter>
        <Cancel onClose={onClose} />
        <Submit pending={pending} disabled={!tags.length}>Add tags</Submit>
      </DialogFooter>
    </form>
  );
}

function DeleteAssets({ ids, label, tenantId, onClose, onAssetsDeleted }: DialogsProps & { ids: string[]; label: string }) {
  const { pending, run } = useSubmit();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const { count } = await api<{ count: number }>("/api/assets/bulk", {
            method: "POST",
            body: { tenantId, action: "delete", ids },
          });
          onAssetsDeleted(ids);
          notify.success(`Deleted ${plural(count, "file")}`);
          onClose();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Delete {label}?</DialogTitle>
        <DialogDescription>
          This permanently removes {ids.length === 1 ? "it" : "them"} for everyone in the workspace. Files uploaded here are deleted
          from storage too.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Cancel onClose={onClose} />
        <Submit pending={pending} destructive>Delete forever</Submit>
      </DialogFooter>
    </form>
  );
}

function AddFromUrl({ folder, tenantId, onClose, onChanged }: DialogsProps & { folder: string | null }) {
  const [url, setUrl] = React.useState("");
  const [name, setName] = React.useState("");
  const { pending, run } = useSubmit();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api("/api/assets", { method: "POST", body: { tenantId, url, name, folder } });
          notify.success("Link added");
          onChanged();
          onClose();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Add from link</DialogTitle>
        <DialogDescription>
          Add an image, video or document hosted elsewhere{folder ? ` to “${folder}”` : ""}. The file stays where it is.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <label htmlFor="add-url" className="text-sm font-medium">Link</label>
        <Input id="add-url" type="url" required autoFocus placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <label htmlFor="add-url-name" className="text-sm font-medium">
          Name <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input id="add-url-name" placeholder="Defaults to the file name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <DialogFooter>
        <Cancel onClose={onClose} />
        <Submit pending={pending} disabled={!url.trim()}>Add</Submit>
      </DialogFooter>
    </form>
  );
}

// ── Folders ──────────────────────────────────────────────────────────────

function NewFolder({ moveIds, tenantId, onClose, onFolderCreated, onAssetsMoved }: DialogsProps & { moveIds?: string[] }) {
  const [name, setName] = React.useState("");
  const { pending, run } = useSubmit();
  const clean = name.trim().replace(/\s+/g, " ");
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          if (moveIds?.length) {
            await api("/api/assets/bulk", { method: "POST", body: { tenantId, action: "move", ids: moveIds, folder: clean } });
            onAssetsMoved(moveIds, clean);
            notify.success(`Moved ${plural(moveIds.length, "file")} to ${clean}`);
          }
          onFolderCreated(clean, !!moveIds?.length);
          onClose();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>New folder</DialogTitle>
        <DialogDescription>
          {moveIds?.length
            ? `The ${plural(moveIds.length, "selected file")} will be moved into it.`
            : "Folders are saved once you add files to them."}
        </DialogDescription>
      </DialogHeader>
      <Input autoFocus placeholder="Untitled folder" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <DialogFooter>
        <Cancel onClose={onClose} />
        <Submit pending={pending} disabled={!clean}>Create</Submit>
      </DialogFooter>
    </form>
  );
}

function RenameFolder({ folder, tenantId, onClose, onFolderRenamed }: DialogsProps & { folder: string }) {
  const [name, setName] = React.useState(folder);
  const { pending, run } = useSubmit();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api("/api/folders", { method: "PATCH", body: { tenantId, from: folder, to: name } });
          onFolderRenamed(folder, name.trim().replace(/\s+/g, " "));
          notify.success("Folder renamed");
          onClose();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Rename folder</DialogTitle>
      </DialogHeader>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} maxLength={120} />
      <DialogFooter>
        <Cancel onClose={onClose} />
        <Submit pending={pending} disabled={!name.trim() || name.trim() === folder}>Rename</Submit>
      </DialogFooter>
    </form>
  );
}

function DeleteFolder({ folder, count, tenantId, canDelete, onClose, onFolderDeleted }: DialogsProps & { folder: string; count: number }) {
  const [deleteContents, setDeleteContents] = React.useState(false);
  const { pending, run } = useSubmit();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const { count: n } = await api<{ count: number }>("/api/folders", {
            method: "DELETE",
            body: { tenantId, name: folder, deleteContents },
          });
          onFolderDeleted(folder);
          notify.success(deleteContents ? `Deleted folder and ${plural(n, "file")}` : `Folder removed — ${plural(n, "file")} moved to Unfiled`);
          onClose();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Delete “{folder}”?</DialogTitle>
        <DialogDescription>
          {deleteContents
            ? `All ${plural(count, "file")} inside will be permanently deleted.`
            : `The ${plural(count, "file")} inside will be moved to Unfiled.`}
        </DialogDescription>
      </DialogHeader>
      {canDelete && count > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={deleteContents} onCheckedChange={(v) => setDeleteContents(v === true)} />
          Also delete everything inside
        </label>
      )}
      <DialogFooter>
        <Cancel onClose={onClose} />
        <Submit pending={pending} destructive>Delete folder</Submit>
      </DialogFooter>
    </form>
  );
}

// ── Sharing ──────────────────────────────────────────────────────────────

function ShareLink({ tenantId, target }: { tenantId: string; target: ShareTarget }) {
  const [days, setDays] = React.useState("7");
  const [link, setLink] = React.useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const { pending, run } = useSubmit();

  const create = () =>
    run(async () => {
      setLink(
        await api("/api/share", {
          method: "POST",
          body: {
            tenantId,
            days: Number(days),
            target: target.kind === "asset" ? { kind: "asset", id: target.id } : { kind: "folder", folder: target.folder },
          },
        })
      );
      setCopied(false);
    });

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    notify.success("Link copied");
  };

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Share {target.kind === "asset" ? `“${target.name}”` : `“${target.folder}”`}</DialogTitle>
        <DialogDescription>
          Anyone with the link can view and download {target.kind === "asset" ? "this file" : "everything in this folder"}. No sign-in
          needed.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-end gap-2">
        <div className="grid flex-1 gap-2">
          <label htmlFor="share-days" className="text-sm font-medium">Link expires after</label>
          <select
            id="share-days"
            value={days}
            onChange={(e) => { setDays(e.target.value); setLink(null); }}
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="365">1 year</option>
          </select>
        </div>
        <Button type="button" onClick={create} disabled={pending} className="h-9">
          {pending ? <Loader2 className="animate-spin" /> : <Link2 />}
          {link ? "New link" : "Create link"}
        </Button>
      </div>
      {link && (
        <div className="grid gap-2">
          <div className="flex gap-2">
            <Input readOnly value={link.url} onFocus={(e) => e.target.select()} className="font-mono text-xs" data-share-url />
            <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy link">
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Expires {new Date(link.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })}.
          </p>
        </div>
      )}
    </div>
  );
}
