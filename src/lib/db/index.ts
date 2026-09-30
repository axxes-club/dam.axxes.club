import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const url = process.env.DATABASE_URL || "postgresql://build:build@localhost/build";

// v1 production is Neon, reached over its HTTP driver. Anything else — the v2
// Cloud SQL database, a local Postgres — speaks plain Postgres through `pg`.
// The pool connects lazily, so the build-time placeholder URL never dials out.
export const usesNeonHttp = /\.neon\.tech\b/.test(url);
const neonDb = () => drizzle(neon(url), { schema });
export const db: ReturnType<typeof neonDb> = usesNeonHttp
  ? neonDb()
  : (drizzlePg(new pg.Pool({ connectionString: url, max: 5 }), { schema }) as unknown as ReturnType<typeof neonDb>);
