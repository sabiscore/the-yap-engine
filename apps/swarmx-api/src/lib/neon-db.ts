import { neon } from "@neondatabase/serverless";
import { loadEnv } from "./env.js";

type NeonSql = ReturnType<typeof neon>;
let sql: NeonSql | null = null;

export function getNeonSql(): NeonSql {
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
