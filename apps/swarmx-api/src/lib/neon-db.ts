import pg from "pg";
import { loadEnv } from "./env.js";

type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
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
      allowExitOnIdle: true,
    });
  }
  return pool;
}

function buildParameterizedQuery(strings: TemplateStringsArray, values: unknown[]): {
  text: string;
  values: unknown[];
} {
  let text = strings[0] ?? "";
  for (let i = 0; i < values.length; i += 1) {
    text += `$${i + 1}${strings[i + 1] ?? ""}`;
  }
  return { text, values };
}

export function getNeonSql(): SqlTag {
  const tag: SqlTag = async (strings, ...values) => {
    const query = buildParameterizedQuery(strings, values);
    const result = await getPool().query(query.text, query.values);
    return result.rows as Record<string, unknown>[];
  };
  return tag;
}

export async function resetNeonSqlForTesting(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
