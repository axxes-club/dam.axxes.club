export type CompletedFile = { key: string; name: string; url: string; type: string; size: number };
export function completedFile(value: unknown): CompletedFile {
  if (!value || typeof value !== "object") throw new Error("Invalid completed file");
  const file = value as Record<string, unknown>;
  if (typeof file.key !== "string" || !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,255}$/.test(file.key) || typeof file.name !== "string" || !file.name || typeof file.size !== "number" || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 64 * 1024 * 1024) throw new Error("Invalid completed file");
  const url = new URL(String(file.url));
  if (url.protocol !== "https:" || !url.hostname.endsWith(".ufs.sh") || url.pathname !== `/f/${file.key}` || url.username || url.password) throw new Error("Unrecognized file storage");
  return { key: file.key, name: file.name, url: url.toString(), size: file.size, type: typeof file.type === "string" ? file.type : "application/octet-stream" };
}
