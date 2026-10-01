export type FileRouter = Record<string, Builder<any, any>>;
type File = {
  key: string;
  name: string;
  size: number;
  type: string;
  url: string;
  ufsUrl: string;
  generation: string;
};
type Limits = Record<string, { maxFileSize: string; maxFileCount: number }>;
type Builder<I, M> = {
  files: Limits;
  input<T>(parser: { parseAsync(value: unknown): Promise<T> }): Builder<T, M>;
  middleware<T>(
    fn: (value: { req: Request; input: I }) => Promise<T>,
  ): Builder<I, T>;
  onUploadComplete(
    fn: (value: {
      metadata: M;
      file: File;
      transaction: any;
      uploadId: string;
    }) => Promise<any>,
  ): Builder<I, M>;
};
export function createUploadthing(): (files: Limits) => Builder<any, any>;
export function compileRouter(
  router: FileRouter,
  visibility: Record<string, string>,
): any;
export class UploadThingError extends Error {
  constructor(message: string);
}
export function principalOwner(metadata: Record<string, any>): string;
