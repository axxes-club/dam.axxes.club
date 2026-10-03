import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { tenantMemberships, tenants, user } from "./db/schema";
import { auth } from "./auth";
import type { TenantAccess, Viewer } from "./types";

const WRITE_ROLES = new Set(["owner", "admin", "manager", "member"]);
const DELETE_ROLES = new Set(["owner", "admin", "manager"]);

// Folders is on unless a workspace explicitly turns it off (settings.features.folders = false)
function foldersEnabled(
  settings: { features?: Record<string, boolean> } | null,
) {
  return settings?.features?.folders !== false;
}

export async function getViewer(headers: Headers): Promise<Viewer | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  return getViewerById(session.user.id);
}

/** Internal services call this only after authenticating their signed request. */
export async function getViewerById(userId: string): Promise<Viewer | null> {
  const [row] = await db
    .select({ id:user.id,name:user.name,email:user.email,isSuperadmin: user.isSuperadmin, image: user.image })
    .from(user)
    .where(eq(user.id, userId));
  if (!row) return null;
  const isSuperadmin = row.isSuperadmin;

  let tenantList: TenantAccess[];
  if (isSuperadmin) {
    const all = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        settings: tenants.settings,
      })
      .from(tenants)
      .where(and(isNull(tenants.deletedAt), eq(tenants.status, "active")))
      .orderBy(asc(tenants.name));
    tenantList = all
      .filter((t) => foldersEnabled(t.settings))
      .map((t) => ({
        id: t.id,
        name: t.name,
        role: "superadmin",
        canWrite: true,
        canDelete: true,
      }));
  } else {
    const memberships = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        role: tenantMemberships.role,
        settings: tenants.settings,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(
        and(
          eq(tenantMemberships.userId, userId),
          isNull(tenantMemberships.deletedAt),
          isNull(tenants.deletedAt),
          eq(tenants.status, "active"),
        ),
      )
      .orderBy(asc(tenants.name));
    tenantList = memberships
      .filter((m) => foldersEnabled(m.settings))
      .map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        canWrite: WRITE_ROLES.has(m.role),
        canDelete: DELETE_ROLES.has(m.role),
      }));
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row?.image ?? null,
    isSuperadmin,
    tenants: [
      {
        id: "personal",
        name: "Personal",
        role: "owner",
        canWrite: true,
        canDelete: true,
      },
      ...tenantList,
    ],
  };
}

export { tenantAccess } from "./library-access";
