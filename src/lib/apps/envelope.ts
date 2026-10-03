import { createHmac, timingSafeEqual } from "node:crypto"

export type Envelope = { appKey: string; exp: number; action: string; [key: string]: unknown }
export function signEnvelope(payload: Envelope, secret: string): string {
  if (!secret) throw new Error("Folders integration secret is not configured")
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = createHmac("sha256", secret).update(`folders-app:v1:${payload.appKey}:${data}`).digest("base64url")
  return `${data}.${signature}`
}
export function verifyEnvelope(token: string, secret: string, appKey: string, now = Date.now()): Envelope | null {
  if (!secret || token.length > 32_768) return null
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [data, signature] = parts
  const expected = createHmac("sha256", secret).update(`folders-app:v1:${appKey}:${data}`).digest()
  const actual = Buffer.from(signature, "base64url")
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString())
    return payload && payload.appKey === appKey && Number.isFinite(payload.exp) && payload.exp > now && typeof payload.action === "string" ? payload : null
  } catch { return null }
}
