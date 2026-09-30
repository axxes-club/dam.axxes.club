import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// Registered apps validate their own record/audience boundary here. A signed
// request alone never grants permission to a record in another workspace.
export async function validateNexusRecord(userId: string, recordId: string, tenantId: string, write = false) {
  const result = await db.execute(sql`select p.id from nexus_pages p join nexus_spaces sp on sp.id=p.space_id
    join tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=${userId}
    join tenants t on t.id=p.tenant_id
    where p.id=${recordId}::uuid and p.tenant_id=${tenantId}::uuid and p.deleted_at is null
      and sp.deleted_at is null and t.deleted_at is null and m.deleted_at is null
      and (${!write} or m.role in ('owner','admin','manager','member')) limit 1`);
  if (!result.rows.length) throw new Error("Page unavailable or access denied");
}
