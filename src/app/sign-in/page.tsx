import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { HANDSHAKE_URL } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

// Rendered per request so the Handshake redirect follows runtime config
export const dynamic = "force-dynamic";

export default function SignInPage() {
  if (HANDSHAKE_URL) {
    const h = headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    redirect(`${HANDSHAKE_URL}/sign-in?redirect=${encodeURIComponent(`${origin}/`)}`);
  }
  return <SignInForm />;
}
