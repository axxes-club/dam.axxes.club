import { reserveBatch, lockAccount, commitCharge, cancelReservations } from "../storage/quota.mjs";
import { StorageError } from "./core.mjs";
export class PostgresRegistry {
  constructor(pool, {quotaMode="off"}={}) {
    if(!["off","shadow","enforce"].includes(quotaMode)) throw new StorageError("Invalid quota mode",503);
    this.pool = pool;
    this.quotaMode=quotaMode;
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
  async createBatch(records) {
    const client=await this.pool.connect();
    try {
      await client.query("BEGIN");
      if(this.quotaMode!=="off" && records[0]?.metadata?.tenantId !== "personal" && !records[0]?.metadata?.tenantId?.startsWith("user:")) {
        const metadata=records[0]?.metadata;
        const key={tenantId:metadata?.tenantId,userId:metadata?.chargingUserId??metadata?.userId};
        if(!key.tenantId||!key.userId||records.some(r=>r.metadata.tenantId!==key.tenantId||(r.metadata.chargingUserId??r.metadata.userId)!==key.userId)) throw new StorageError("Charging user required",403);
        await reserveBatch(client,{key,records,enforce:this.quotaMode});
      }
      for(const record of records) await client.query("INSERT INTO gcp_asset_uploads(id,owner,document,expires_at) VALUES($1,$2,$3,$4)",[record.id,record.owner,record,new Date(record.maxExpiresAt??record.expiresAt)]);
      await client.query("COMMIT");
    } catch(error) {await client.query("ROLLBACK");throw error;} finally{client.release();}
  }
  async cancelBatch(records) {
    const client=await this.pool.connect();
    try{await client.query("BEGIN");let count=0;
      const groups=new Map();
      for(const record of records)if(record.quota){const group=JSON.stringify(record.quota);if(!groups.has(group))groups.set(group,[]);groups.get(group).push(record);}
      for(const group of [...groups.keys()].sort()){const records=groups.get(group);count+=await cancelReservations(client,{key:records[0].quota,uploadIds:records.map(r=>r.id)});}
      await client.query("COMMIT");return count;
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
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
        if(row.document.quota) {
          const {rows:[reservation]}=await client.query("SELECT state,expires_at FROM storage_reservations WHERE upload_id=$1",[id]);
          if(!reservation||reservation.state!=="pending"||new Date(reservation.expires_at)<=new Date())throw new StorageError("Upload reservation closed",410);
        }
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
        const document=r.rows[0].document;
        if(document.quota) {
          await lockAccount(client,document.quota);
          const {rows:[reservation]}=await client.query("SELECT state,expires_at FROM storage_reservations WHERE upload_id=$1 FOR UPDATE",[id]);
          if(!reservation||reservation.state!=="pending"||new Date(reservation.expires_at)<=new Date())throw new StorageError("Upload reservation closed",410);
        }
        result = await run(document, client);
        if(document.quota) await commitCharge(client,{uploadId:id,assetId:result.serverData?.assetId,objectKey:result.key,generation:result.generation,actualBytes:String(result.size)});
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
