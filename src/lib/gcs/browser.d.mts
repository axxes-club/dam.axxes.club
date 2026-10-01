export type Uploaded = {
  key: string;
  name: string;
  size: number;
  type: string;
  url: string;
  ufsUrl: string;
  serverData: any;
};
export type UploadOptions = {
  files: File[];
  input?: unknown;
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  onUploadProgress?: (percent: number) => void;
  signal?: AbortSignal;
};
export function createUploader(
  options?: any,
): (route: string, options: UploadOptions) => Promise<Uploaded[]>;
export function postFile(
  file: File,
  policy: any,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void>;
