import { StorageError } from "./core.mjs";
export class PrismaRegistry {
  constructor(prisma) {
    this.prisma = prisma;
  }
  async create(record) {
    await this.prisma.$executeRawUnsafe(
      "INSERT INTO gcp_asset_uploads(id,owner,document,expires_at) VALUES($1::uuid,$2,$3::jsonb,$4)",
      record.id,
      record.owner,
      JSON.stringify(record),
      new Date(record.maxExpiresAt ?? record.expiresAt),
    );
  }
  async get(id) {
    const rows = await this.prisma.$queryRawUnsafe(
      "SELECT document,result FROM gcp_asset_uploads WHERE id=$1::uuid",
      id,
    );
    return rows[0] ? { ...rows[0].document, result: rows[0].result } : null;
  }
  async renewOnce(id, owner, renew) {
    return this.prisma.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRawUnsafe(
          "SELECT owner,document,result FROM gcp_asset_uploads WHERE id=$1::uuid FOR UPDATE",
          id,
        );
        const row = rows[0];
        if (!row || row.owner !== owner)
          throw new StorageError("Upload owner mismatch", 403);
        if (row.result != null) return { complete: row.result };
        const result = await renew(row.document, transaction);
        const deadline = row.document.maxExpiresAt ?? row.document.expiresAt;
        await transaction.$executeRawUnsafe(
          "UPDATE gcp_asset_uploads SET document=$2::jsonb,expires_at=$3 WHERE id=$1::uuid",
          id,
          JSON.stringify(row.document),
          new Date(deadline),
        );
        return result;
      },
      { maxWait: 10000, timeout: 60000 },
    );
  }
  async completeOnce(id, owner, run) {
    return this.prisma.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRawUnsafe(
          "SELECT owner,document,result FROM gcp_asset_uploads WHERE id=$1::uuid FOR UPDATE",
          id,
        );
        const row = rows[0];
        if (!row || row.owner !== owner)
          throw new StorageError("Upload owner mismatch", 403);
        if (row.result != null) return row.result;
        const result = await run(row.document, transaction);
        await transaction.$executeRawUnsafe(
          "UPDATE gcp_asset_uploads SET result=$2::jsonb WHERE id=$1::uuid",
          id,
          JSON.stringify(result),
        );
        return result;
      },
      { maxWait: 10000, timeout: 60000 },
    );
  }
}
