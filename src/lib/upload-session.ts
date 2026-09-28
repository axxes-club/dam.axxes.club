import { randomBytes } from "crypto";
import QRCode from "qrcode";

/**
 * The desktop cannot reach the phone, so the handoff is a link: an unguessable
 * token in a URL, shown as a QR code, valid for a short window. Whoever holds
 * the link can add photos to that one session and nothing else.
 */

export const SESSION_TTL_MINUTES = 30;

export function createToken(): string {
  return randomBytes(24).toString("base64url");
}

export function expiryFromNow(): Date {
  return new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);
}

/**
 * The phone is on the same network, not on localhost, so the QR has to carry an
 * address the phone can actually resolve. The request's own host is the best
 * guess; `NEXT_PUBLIC_APP_URL` overrides it for a deployed install.
 */
export function baseUrlFrom(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  const url = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? req.headers.get("host") ?? url.host;
  const protocol = forwardedProto ?? url.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

/** An SVG QR code, rendered on the server so the client bundle stays small. */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    width: 220,
    errorCorrectionLevel: "M",
    color: { dark: "#242424", light: "#ffffff" }
  });
}
