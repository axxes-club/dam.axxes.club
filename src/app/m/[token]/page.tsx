import { db } from "@/lib/db";
import { uploadSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AlertTriangle } from "lucide-react";
import MobileCaptureClient from "./MobileCaptureClient";

export const dynamic = "force-dynamic";

export default async function MobileCapturePage({
  params
}: {
  params: { token: string };
}) {
  const { token } = params;

  const [handoff] = await db.select().from(uploadSessions).where(eq(uploadSessions.token, token));

  const expired = !handoff || handoff.expiresAt.getTime() < Date.now();

  if (expired) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[520px] flex-col items-center justify-center gap-3 p-6 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 text-orange-600"
          aria-hidden
        >
          <AlertTriangle size={26} />
        </span>
        <h1 className="text-xl font-semibold">{handoff ? "Session expired" : "Link not found"}</h1>
        <p className="text-sm text-muted-foreground">Scan a new QR code from your computer to continue.</p>
      </main>
    );
  }

  return (
    <MobileCaptureClient
      token={token}
      folder={handoff.folder}
    />
  );
}
