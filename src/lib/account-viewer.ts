import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { user, tenantMemberships, tenants } from "./db/schema";
import type { Viewer } from "./types";

export async function viewerForUser(userId: string, database: typeof db = db): Promise<Viewer> {
  const [account] = await database.select().from(user).where(eq(user.id, userId));
  if (!account) throw new Error("Owner account unavailable");
  const memberships = account.isSuperadmin ? (await database.select({ id: tenants.id, name: tenants.name, settings: tenants.settings }).from(tenants).where(isNull(tenants.deletedAt))).map(t => ({ ...t, role: "superadmin" })) : await database.select({ id: tenants.id, name: tenants.name, role: tenantMemberships.role, settings: tenants.settings })
    .from(tenantMemberships).innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
    .where(and(eq(tenantMemberships.userId, userId), isNull(tenantMemberships.deletedAt), isNull(tenants.deletedAt)));
  return { id: account.id, name: account.name, email: account.email, image: account.image,
    isSuperadmin: account.isSuperadmin, tenants: [ { id: "personal", name: "Personal", role: "owner", canWrite: true, canDelete: true },
      ...memberships.filter(m => m.settings?.features?.folders !== false).map(m => ({ id: m.id, name: m.name, role: m.role,
        canWrite: ["owner", "admin", "manager", "member", "superadmin"].includes(m.role), canDelete: ["owner", "admin", "manager", "superadmin"].includes(m.role) })) ] };
}
