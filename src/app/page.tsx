import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FoldersApp } from "@/components/folders/app";
import { getViewer } from "@/lib/access";
import { HANDSHAKE_URL } from "@/lib/auth";

export default async function Home() {
  const viewer = await getViewer(headers());
  if (!viewer) redirect("/sign-in");
  return <FoldersApp viewer={viewer} handshakeUrl={HANDSHAKE_URL} />;
}
