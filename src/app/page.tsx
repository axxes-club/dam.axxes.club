import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FoldersApp } from "@/components/folders/app";
import { getViewer } from "@/lib/access";

export default async function Home() {
  const viewer = await getViewer(headers());
  if (!viewer) redirect("/sign-in");
  return <FoldersApp viewer={viewer} />;
}
