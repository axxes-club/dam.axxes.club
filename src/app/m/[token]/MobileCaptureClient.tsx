"use client";

import { useRef, useState } from "react";
import { Camera, Images, Check, Loader2, AlertTriangle } from "lucide-react";
import { useUploadThing } from "@/utils/uploadthing";

export default function MobileCaptureClient({
  token,
  folder,
}: {
  token: string;
  folder: string | null;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const [sent, setSent] = useState<string[]>([]);
  const [pending, setPending] = useState(0);
  const [view, setView] = useState<"capture" | "success" | "done">("capture");
  const [error, setError] = useState("");

  const { startUpload } = useUploadThing("handoffUploader", {
    onClientUploadComplete: res => {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([50, 100, 50]);
      const urls = (res ?? []).map(file => file.ufsUrl).filter(Boolean) as string[];
      setSent(current => [...urls, ...current]);
      setPending(0);
      setView("success");
    },
    onUploadError: () => {
      setError("Upload failed");
      setPending(0);
    },
    headers: () => ({ "x-handoff-token": token })
  });

  const send = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");
    setPending(files.length);
    startUpload(Array.from(files));
  };


  if (view === "done") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <Check size={32} />
        </div>
        <h1 className="text-xl font-semibold text-foreground">You&apos;re all set!</h1>
        <p className="text-muted-foreground">You can close this tab.</p>
      </main>
    );
  }

  if (view === "success") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col gap-6 p-6 text-center pt-16">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <Check size={32} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Upload successful</h1>
          <p className="mt-2 text-muted-foreground">The photos have been sent to your computer.</p>
        </div>

        {sent.length > 0 && (
          <div className="grid grid-cols-3 gap-2 px-4 py-2">
            {sent.slice(0, 3).map(url => (
              <img key={url} src={url} alt="" loading="lazy" className="aspect-square w-full rounded-md object-cover border" />
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3">
          <button type="button" onClick={() => setView("capture")} className="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
            <Camera size={20} className="mr-2" /> Add another
          </button>
          <button type="button" onClick={() => setView("done")} className="inline-flex h-12 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
            I&apos;m done
          </button>
        </div>
        
        <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" multiple className="hidden" onChange={e => { send(e.target.files); e.target.value = ""; }} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col gap-4 p-4">
      <header className="pt-2">
        <h1 className="text-xl font-semibold text-foreground">Upload to Folders</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {folder ? `Destination: ${folder}` : "Destination: Home (unfiled)"}
        </p>
      </header>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={e => { send(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={e => { send(e.target.files); e.target.value = ""; }}
      />

      <button
        type="button"
        onClick={() => {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
          cameraRef.current?.click();
        }}
        disabled={pending > 0}
        className="inline-flex h-32 w-full flex-col items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
      >
        {pending > 0 ? <Loader2 size={30} className="animate-spin" /> : <Camera size={30} />}
        {pending > 0 ? `Uploading ${pending} files...` : "Take Photo"}
      </button>

      <button
        type="button"
        onClick={() => {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
          libraryRef.current?.click();
        }}
        disabled={pending > 0}
        className="inline-flex h-12 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
      >
        <Images size={18} className="mr-2" />
        Choose from Library
      </button>

      {error && (
        <p role="alert" className="mt-2 flex items-center justify-center gap-2 text-sm text-red-500">
          <AlertTriangle size={15} aria-hidden />
          {error}
        </p>
      )}
    </main>
  );

}
