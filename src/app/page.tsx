import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { FoldersApp } from "@/components/folders/app";
import { getViewer } from "@/lib/access";
import { HANDSHAKE_URL } from "@/lib/auth";
import { getCustomerBrand } from "@/lib/white-label";

export default async function Home() {
  const viewer = await getViewer(headers());
  if (!viewer) redirect("/sign-in");
  // Someone in exactly one organization that is a white-label customer sees
  // Folders in that customer's brand; anyone spanning several sees standard AXXES.
  const only = viewer.tenants.length === 1 ? viewer.tenants[0] : null;
  const brand = only && only.role !== "superadmin" ? await getCustomerBrand(only.id) : null;
  const initialTenantId = cookies().get("folders_tenant_id")?.value;
  return <FoldersApp initialTenantId={initialTenantId} viewer={viewer} handshakeUrl={HANDSHAKE_URL} brand={brand} />;
}
