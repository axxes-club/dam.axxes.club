import { NextResponse, type NextRequest } from "next/server"
import { auth, HANDSHAKE_URL } from "@/lib/auth"
import { publicOrigin } from "@/lib/public-origin"

/**
 * Sign-out goes through Handshake, because the session cookie is shared across
 * every *.axxes.club app. Signing out only here would clear this app's copy of
 * the cookie and leave the person still signed in everywhere else — which reads
 * as "sign out did nothing".
 *
 * The redirect target is validated against the AXXES parent domain before it is
 * sent, so this cannot be used as an open redirect.
 */
export async function GET(req: NextRequest) {
  const back = new URL("/", publicOrigin(req)).href

  if (HANDSHAKE_URL) {
    return NextResponse.redirect(`${HANDSHAKE_URL}/sign-out?redirect=${encodeURIComponent(back)}`)
  }

  const result = await auth.api.signOut({ headers: req.headers, asResponse: true }).catch(() => null)
  const res = NextResponse.redirect(new URL("/sign-in", publicOrigin(req)))
  result?.headers.getSetCookie().forEach((cookie) => res.headers.append("set-cookie", cookie))
  return res
}
