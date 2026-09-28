import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { tenantMemberships, tenants, user } from "./db/schema";
import { auth } from "./auth";
import type { TenantAccess, Viewer } from "./types";

const WRITE_ROLES = new Set(["owner", "admin", "manager", "member"]);
const DELETE_ROLES = new Set(["owner", "admin", "manager"]);

export async function getViewer(headers: Headers): Promise<Viewer | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  const [row] = await db
    .select({ isSuperadmin: user.isSuperadmin })
    .from(user)
    .where(eq(user.id, session.user.id));
  const isSuperadmin = row?.isSuperadmin ?? false;

  let tenantList: TenantAccess[];
  if (isSuperadmin) {
    const all = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(isNull(tenants.deletedAt))
      .orderBy(asc(tenants.name));
    tenantList = all.map((t) => ({ ...t, role: "superadmin", canWrite: true, canDelete: true }));
  } else {
    const memberships = await db
      .select({ id: tenants.id, name: tenants.name, role: tenantMemberships.role })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(
        and(
          eq(tenantMemberships.userId, session.user.id),
          isNull(tenantMemberships.deletedAt),
          isNull(tenants.deletedAt)
        )
      )
      .orderBy(asc(tenants.name));
    tenantList = memberships.map((m) => ({
      ...m,
      canWrite: WRITE_ROLES.has(m.role),
      canDelete: DELETE_ROLES.has(m.role),
    }));
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    isSuperadmin,
    tenants: tenantList,
  };
}

export function tenantAccess(viewer: Viewer, tenantId: string | null | undefined) {
  if (!tenantId) return null;
  return viewer.tenants.find((t) => t.id === tenantId) ?? null;
}
