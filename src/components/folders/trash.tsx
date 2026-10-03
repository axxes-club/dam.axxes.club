"use client";
import * as React from "react";
import type { Asset, FolderPolicy } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api, notify } from "./utils";
import { blockingFolder, lifecycleStatus } from "./lifecycle";
export function TrashList({
  assets,
  folderPolicies,
  tenantId,
  canDelete,
  onChanged,
}: {
  assets: Asset[];
  folderPolicies: FolderPolicy[];
  tenantId: string;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const unavailableFolders = folderPolicies.filter(
    (p) =>
      p.trashedAt || (p.expiresAt && Date.parse(p.expiresAt) <= Date.now()),
  );
  const [deleting, setDeleting] = React.useState<Asset | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);
  async function restoreFolder(folder: FolderPolicy) {
    setPending(folder.path);
    try {
      await api("/api/folders", {
        method: "PATCH",
        body: { tenantId, folder: folder.path, restore: true, expiresAt: null },
      });
      notify.success("Folder restored");
      onChanged();
    } catch (error) {
      notify.error(error);
    } finally {
      setPending(null);
    }
  }
  async function mutate(asset: Asset, permanent = false) {
    setPending(asset.id);
    try {
      await api(
        `/api/assets/${asset.id}${permanent ? "?permanent=1" : ""}`,
        permanent
          ? { method: "DELETE" }
          : {
              method: "PATCH",
              body: {
                restore: true,
                ...(asset.expiresAt && Date.parse(asset.expiresAt) <= Date.now()
                  ? { expiresAt: null }
                  : {}),
              },
            },
      );
      notify.success(permanent ? "File permanently deleted" : "File restored");
      setDeleting(null);
      onChanged();
    } catch (error) {
      notify.error(error);
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="grid gap-3 py-4">
      <p className="text-sm text-muted-foreground">
        Files in Trash cannot be opened by linked apps. Restore them before the
        retention period ends. Restoring an expired file clears its own
        expiration; an expired parent folder must be updated first.
      </p>
      {unavailableFolders.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-medium">Unavailable folders</h2>
          <p className="text-xs text-muted-foreground">
            Restore a folder to clear its expiration and recover files removed
            by its policy. Individually deleted files remain in Trash.
          </p>
          {unavailableFolders.map((folder) => (
            <div
              key={folder.path}
              className="flex flex-wrap items-center gap-3 rounded-xl border p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="break-words font-medium">{folder.path}</p>
                <p className="text-xs text-muted-foreground">
                  {lifecycleStatus(folder)}
                </p>
              </div>
              {canDelete && (
                <Button
                  variant="outline"
                  disabled={
                    pending !== null ||
                    !!blockingFolder(
                      folder.path,
                      folderPolicies.filter((p) => p.path !== folder.path),
                    )
                  }
                  onClick={() => restoreFolder(folder)}
                >
                  Restore folder
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
      {assets.length === 0 && unavailableFolders.length === 0 && (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          Trash is empty
        </p>
      )}
      {assets.map((asset) => {
        const blockedBy = blockingFolder(asset.folder, folderPolicies);
        return (
          <div
            key={asset.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{asset.name}</p>
              <p className="text-xs text-muted-foreground">
                {asset.folder ?? "Unfiled"} · {lifecycleStatus(asset)}
                {blockedBy && (
                  <span className="mt-1 block">
                    Restore folder {blockedBy.path} first.
                  </span>
                )}
              </p>
            </div>
            {canDelete && (
              <>
                <Button
                  variant="outline"
                  disabled={pending !== null || !!blockedBy}
                  onClick={() => mutate(asset)}
                >
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={pending !== null}
                  onClick={() => setDeleting(asset)}
                >
                  Delete forever
                </Button>
              </>
            )}
          </div>
        );
      })}
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name} forever?</DialogTitle>
            <DialogDescription>
              This permanently removes the file from storage. You cannot restore
              it afterward.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={!!pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!!pending}
              onClick={() => deleting && mutate(deleting, true)}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
