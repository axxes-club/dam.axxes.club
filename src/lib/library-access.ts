import type { Viewer } from "./types";
export function tenantAccess(
  viewer: Viewer,
  tenantId: string | null | undefined,
) {
  if (!tenantId) return null;
  if (tenantId === "personal")
    return {
      id: "personal",
      name: "Personal",
      role: "owner",
      canWrite: true,
      canDelete: true,
    };
  return viewer.tenants.find((t) => t.id === tenantId) ?? null;
}
