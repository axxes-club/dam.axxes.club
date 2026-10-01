import { StorageError } from "./core.mjs";
export class PostgresRegistry {
  constructor(pool) {
    this.pool = pool;
  }
  async create(record) {
    await this.pool.query(
      "INSERT INTO gcp_asset_uploads(id,owner,document,expires_at) VALUES($1,$2,$3,$4)",
      [
        record.id,
        record.owner,
        record,
        new Date(record.maxExpiresAt ?? record.expiresAt),
      ],
    );
  }
  async get(id) {
    const r = await this.pool.query(
      "SELECT document,result FROM gcp_asset_uploads WHERE id=$1",
      [id],
    );
    if (!r.rows[0]) return null;
    return { ...r.rows[0].document, result: r.rows[0].result };
  }
  async renewOnce(id, owner, renew) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const response = await client.query(
        "SELECT owner,document,result FROM gcp_asset_uploads WHERE id=$1 FOR UPDATE",
        [id],
      );
      const row = response.rows[0];
      if (!row || row.owner !== owner)
        throw new StorageError("Upload owner mismatch", 403);
      let result;
      if (row.result != null) result = { complete: row.result };
      else {
        result = await renew(row.document, client);
        const deadline = row.document.maxExpiresAt ?? row.document.expiresAt;
        await client.query(
          "UPDATE gcp_asset_uploads SET document=$2,expires_at=$3 WHERE id=$1",
          [id, row.document, new Date(deadline)],
        );
      }
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async completeOnce(id, owner, run) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        "SELECT owner,document,result FROM gcp_asset_uploads WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!r.rows[0] || r.rows[0].owner !== owner)
        throw new StorageError("Upload owner mismatch", 403);
      let result = r.rows[0].result;
      if (result == null) {
        result = await run(r.rows[0].document, client);
        await client.query(
          "UPDATE gcp_asset_uploads SET result=$2 WHERE id=$1",
          [id, result],
        );
      }
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
