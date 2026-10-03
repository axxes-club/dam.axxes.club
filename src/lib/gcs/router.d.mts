import type {PoolClient} from "pg";
import type {CompiledRoute,Metadata} from "./contracts.mjs";
export type FileRouter = Record<string, {files:Limits}>;
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
    fn: (value: {
      req: Request;
      input: I;
      phase: "init" | "continue" | "replay";
    }) => Promise<T>,
  ): Builder<I, T>;
  onUploadComplete(
    fn: (value: {
      metadata: M;
      file: File;
      transaction: PoolClient;
      uploadId: string;
    }) => Promise<unknown>,
  ): Builder<I, M>;
};
export function createUploadthing(): (files: Limits) => Builder<unknown, Metadata>;
export function compileRouter(
  router: FileRouter,
  visibility: Record<string, string>,
): Record<string, CompiledRoute<PoolClient>>;
export class UploadThingError extends Error {
  constructor(message: string);
}
export function principalOwner(metadata: Metadata): string;
