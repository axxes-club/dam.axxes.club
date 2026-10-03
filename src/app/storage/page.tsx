import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/access";
import { StoragePanel } from "@/components/storage/storage-panel";
export const dynamic = "force-dynamic";
export default async function StoragePage({searchParams}:{searchParams:{tenantId?:string}}) {
 const viewer = await getViewer(headers());
 if (!viewer) redirect("/sign-in");
 const tenant = viewer.tenants.find(t=>t.id===searchParams.tenantId) ?? viewer.tenants[0];
 if (!tenant) return <p className="p-6">Storage allowances apply to organization libraries.</p>;
 return <StoragePanel tenantId={tenant.id} organizations={viewer.tenants.map(t=>({id:t.id,name:t.name}))} />;
}
