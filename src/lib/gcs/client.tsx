"use client";
import { useRef, useState } from "react";
import { createUploader } from "./browser.mjs";
import { createProviderUpload } from "./provider.mjs";
type Uploaded = {
  key: string;
  name: string;
  size: number;
  type: string;
  url: string;
  ufsUrl: string;
  serverData: any;
};
type Options = {
  onUploadBegin?: (fileName: string) => void;
  headers?: Record<string, string> | (() => Record<string, string>);
  onUploadProgress?: (percent: number) => void;
  onClientUploadComplete?: (files: Uploaded[]) => void | Promise<void>;
  onUploadError?: (error: Error) => void;
};
const upload = createProviderUpload({
  gcsUpload: createUploader(),
  legacyUpload: async (route, options) => {
    const { generateReactHelpers } = await import("@uploadthing/react");
    return generateReactHelpers<any>().uploadFiles(route, {
      ...options,
      onUploadProgress: (event) =>
        options.onUploadProgress?.(event.totalProgress),
    }) as Promise<Uploaded[]>;
  },
});
export const uploadFiles = upload;
export function useUploadThing(route: string, options: Options = {}) {
  const [isUploading, setUploading] = useState(false);
  const abort = useRef<AbortController | null>(null);
  async function startUpload(files: File[], input?: unknown) {
    setUploading(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      files.forEach((file) => options.onUploadBegin?.(file.name));
      const results = await upload(route, {
        files,
        input,
        headers: options.headers,
        onUploadProgress: options.onUploadProgress,
        signal: controller.signal,
      });
      await options.onClientUploadComplete?.(results);
      return results;
    } catch (cause) {
      const error = cause instanceof Error ? cause : Error("Upload failed");
      options.onUploadError?.(error);
      return undefined;
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setUploading(false);
      }
    }
  }
  return {
    startUpload,
    isUploading,
    abortUpload: () => abort.current?.abort(),
  };
}
