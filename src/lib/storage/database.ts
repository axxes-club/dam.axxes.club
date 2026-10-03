import { db } from "@/lib/db";
import { Pool } from "pg";
const poolGlobal = globalThis as typeof globalThis & { gcsReceiptPool?: Pool };
function createReceiptPool() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", (error: Error & { code?: string }) => {
    console.error("GCS receipt pool idle error", error.code ?? "PG_POOL_ERROR");
  });
  return pool;
}
export function storagePool() {
  const client = (db as unknown as { $client?: Pool }).$client;
  if (client && typeof client.connect === "function") return client;
  return (poolGlobal.gcsReceiptPool ??= createReceiptPool());
}
