import { createHmac, timingSafeEqual } from "crypto";

// Share links are signed tokens rather than database rows: they carry the target and an
// expiry, and can't be forged without the auth secret.
export type SharePayload =
  | { k: "asset"; t: string; id: string; exp: number }
  | { k: "folder"; t: string; f: string; exp: number };

function secret() {
  const base = process.env.BETTER_AUTH_SECRET;
  if (!base) throw new Error("BETTER_AUTH_SECRET is not configured");
  return `${base}:folders-share:v1`;
}

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createShareToken(payload: SharePayload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifyShareToken(token: string): SharePayload | null {
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as SharePayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
