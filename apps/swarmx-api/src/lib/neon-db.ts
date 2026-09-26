import pg from "pg";
import { loadEnv } from "./env.js";

type SqlClient = pg.Pool;
let pool: SqlClient | null = null;

export function getNeonSql(): pg.Pool {
  const databaseUrl = loadEnv().DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for durable Neon state");
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export async function queryNeon<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<{ rows: T[] }> {
  const client = getNeonSql();
  return client.query<T>(text, values);
}

export async function resetNeonSqlForTesting(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
