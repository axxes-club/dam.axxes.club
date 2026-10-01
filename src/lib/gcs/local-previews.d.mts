export class LocalPreviews {
  constructor(urls?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">);
  select(files: Iterable<Blob>): void;
  complete(): string[];
  dispose(): void;
}
