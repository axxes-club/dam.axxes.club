import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { HANDSHAKE_URL } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";
import { safeLocalPath } from '@/lib/folders-oidc';

// Rendered per request so the Handshake redirect follows runtime config
export const dynamic = "force-dynamic";

export default async function SignInPage({searchParams}:{searchParams: Promise<{next?:string;error?:string;signedOut?:string}>}) {
  if (HANDSHAKE_URL) {
    if(process.env.AXXES_OIDC_CLIENT_SECRET&&!(await searchParams).error&&!(await searchParams).signedOut){
      redirect(`/api/auth/axxes/start?next=${encodeURIComponent(safeLocalPath((await searchParams).next))}`);
    }
    // During migration show the existing account form rather than a cross-domain cookie loop.
    const h = await headers();
    const host = (h.get('x-forwarded-host')??h.get('host')??'').split(':')[0];
    if(host==='folders.axxes.app')return <><SignInForm />{(await searchParams).signedOut&&<a className="fixed bottom-6 inset-x-6 text-center text-sm underline" href={`/api/auth/axxes/start?next=${encodeURIComponent(safeLocalPath((await searchParams).next))}`}>Continue with AXXES</a>}{(await searchParams).error&&<p role="alert" className="fixed bottom-6 inset-x-6 text-center text-sm">AXXES sign-in could not finish. You can sign in with your existing account below.</p>}</>;
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    redirect(`${HANDSHAKE_URL}/sign-in?redirect=${encodeURIComponent(`${origin}/`)}`);
  }
  return <SignInForm />;
}
