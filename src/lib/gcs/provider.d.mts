import type { UploadOptions, Uploaded } from "./browser.mjs";
export function createProviderUpload(options: {
  fetchImpl?: typeof fetch;
  gcsUpload: (route: string, options: UploadOptions) => Promise<Uploaded[]>;
  legacyUpload: (route: string, options: UploadOptions) => Promise<Uploaded[]>;
}): (route: string, options: UploadOptions) => Promise<Uploaded[]>;
