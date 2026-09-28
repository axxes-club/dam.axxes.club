"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Handoff = { token: string; url: string; qr: string; expiresAt: string };

const POLL_MS = 2000;

/**
 * Desk-to-pocket upload: the desktop opens a short-lived session and shows it as a
 * QR code; photos taken on the phone land in the current folder and show up here
 * as they arrive. Closing the dialog ends the session.
 */
export default function PhotoHandoffDialog({
  tenantId,
  folder,
  onDone,
  onClose,
}: {
  tenantId: string;
  folder: string | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const [handoff, setHandoff] = React.useState<Handoff | null>(null);
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [failed, setFailed] = React.useState(false);
  const [expired, setExpired] = React.useState(false);
  const [minutesLeft, setMinutesLeft] = React.useState<number | null>(null);

  const start = React.useCallback(async () => {
    setFailed(false);
    setExpired(false);
    setPhotos([]);
    setHandoff(null);
    try {
      const res = await fetch("/api/upload-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, folder }),
      });
      if (!res.ok) throw new Error();
      setHandoff(await res.json());
    } catch {
      setFailed(true);
    }
  }, [tenantId, folder]);

  React.useEffect(() => {
    start();
  }, [start]);

  // Poll the session for photos until it lapses
  React.useEffect(() => {
    if (!handoff || expired) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/upload-sessions/${handoff.token}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setPhotos(data.photos.map((p: { url: string }) => p.url));
        setMinutesLeft(Math.max(0, Math.round((new Date(data.expiresAt).getTime() - Date.now()) / 60000)));
        if (data.expired) setExpired(true);
      } catch {
        // A dropped poll isn't worth reporting; the next one will catch up.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [handoff, expired]);

  const close = React.useCallback(() => {
    if (handoff) fetch(`/api/upload-sessions/${handoff.token}`, { method: "DELETE" }).catch(() => {});
    if (photos.length) onDone();
    onClose();
  }, [handoff, photos.length, onDone, onClose]);

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="size-5 text-primary" /> Upload from phone
          </DialogTitle>
          <DialogDescription>
            Scan this code with your phone&apos;s camera to add photos to {folder ? `“${folder}”` : "Home"}. No app or sign-in needed.
          </DialogDescription>
        </DialogHeader>

        {failed ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle className="size-6 text-destructive" aria-hidden />
            <p className="text-sm font-medium">Couldn&apos;t start a phone session</p>
            <Button variant="outline" className="rounded-full" onClick={start}>
              <RefreshCw /> Try again
            </Button>
          </div>
        ) : !handoff ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-label="Starting session" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div
              className="rounded-xl border bg-white p-3"
              data-handoff-qr
              // Rendered on the server; no QR library ships to the browser
              dangerouslySetInnerHTML={{ __html: handoff.qr }}
            />
            <p className="text-xs text-muted-foreground">
              {expired ? (
                <span className="text-destructive">This code expired. </span>
              ) : (
                `Expires in ${minutesLeft ?? 30} minutes`
              )}
              {expired && (
                <button type="button" className="font-medium text-primary hover:underline" onClick={start}>
                  Get a new code
                </button>
              )}
            </p>
            <details className="w-full text-center">
              <summary className="cursor-pointer text-xs text-muted-foreground">Or copy the link</summary>
              <p className="mt-1 select-all break-all font-mono text-xs" data-handoff-url>{handoff.url}</p>
            </details>

            <div className="w-full rounded-xl bg-secondary p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                {photos.length === 0 ? (
                  <><Loader2 className="size-3.5 animate-spin" aria-hidden /> Waiting for photos…</>
                ) : (
                  <><Check className="size-3.5 text-primary" aria-hidden /> {photos.length} photo{photos.length === 1 ? "" : "s"} added</>
                )}
              </p>
              {photos.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="" className="aspect-square w-full rounded-md bg-card object-cover" />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button className="rounded-full px-5" onClick={close}>
            {photos.length ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
