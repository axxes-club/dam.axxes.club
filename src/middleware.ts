import { NextResponse, type NextRequest } from "next/server";

// The DAM now lives inside the members portal; keep folder/type deep links working.
export function middleware(req: NextRequest) {
  const target = new URL("https://members.axxes.club/assets");
  for (const key of ["folder", "type"]) {
    const value = req.nextUrl.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
