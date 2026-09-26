import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { loadEnv } from "./env.js";

let sql: NeonQueryFunction<false, false> | null = null;

export function getNeonSql(): NeonQueryFunction<false, false> {
  const databaseUrl = loadEnv().DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for durable Neon state");
  }
  if (!sql) {
    sql = neon(databaseUrl);
  }
  return sql;
}

export function resetNeonSqlForTesting(): void {
  sql = null;
}
