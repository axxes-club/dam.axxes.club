import { validateNexusRecord } from "./nexus";

export type AssetAppRegistration = {
  name: string;
  validateRecord: (userId: string, recordId: string, audienceTenantId: string, write?: boolean) => Promise<void>;
};
/** Adding an app requires an explicit server-side record authorization adapter.
 * Unregistered identities cannot obtain storage or attachment grants. */
export const ASSET_APPS: Record<string, AssetAppRegistration> = {
  nexus: { name: "Nexus", validateRecord: validateNexusRecord },
};
