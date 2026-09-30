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

  const [row] = await db
    .select({ isSuperadmin: user.isSuperadmin, image: user.image })
    .from(user)
    .where(eq(user.id, session.user.id));
  const isSuperadmin = row?.isSuperadmin ?? false;

  let tenantList: TenantAccess[];
  if (isSuperadmin) {
    const all = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        settings: tenants.settings,
      })
      .from(tenants)
      .where(isNull(tenants.deletedAt))
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
          eq(tenantMemberships.userId, session.user.id),
          isNull(tenantMemberships.deletedAt),
          isNull(tenants.deletedAt),
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
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
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
