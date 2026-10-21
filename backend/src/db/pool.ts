import pg, { type PoolClient, type QueryResult } from "pg";
import { config } from "../config.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let isConnected = false;

export function getPool(): pg.Pool | null {
  if (pool) return pool;
  if (!config.databaseUrl) return null;

  const isLocal = config.databaseUrl.includes("localhost") || config.databaseUrl.includes("127.0.0.1");

  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10,
  });

  pool.on("error", (err) => {
    console.error("Unexpected error on idle PostgreSQL client:", err.message);
    isConnected = false;
  });

  return pool;
}

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  const p = getPool();
  if (!p) {
    throw new Error("PostgreSQL is not configured. DATABASE_URL is missing.");
  }
  return p.query<T>(text, params);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const p = getPool();
  if (!p) {
    throw new Error("PostgreSQL is not configured. Cannot run transactional operation.");
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDbReadiness(): Promise<{
  ready: boolean;
  mode: string;
  latencyMs: number;
  error?: string;
}> {
  if (!config.databaseUrl) {
    return {
      ready: !config.isProduction, // In non-production, fallback is allowed
      mode: "local-fallback",
      latencyMs: 0,
      error: config.isProduction ? "DATABASE_URL is missing in production" : undefined,
    };
  }

  const p = getPool();
  if (!p) {
    return {
      ready: false,
      mode: "uninitialized",
      latencyMs: 0,
      error: "Pool could not be created",
    };
  }

  const start = Date.now();
  try {
    const res = await p.query("SELECT 1 AS ready_probe");
    const latencyMs = Date.now() - start;
    if (res.rows[0]?.ready_probe === 1) {
      isConnected = true;
      return { ready: true, mode: "supabase-postgres", latencyMs };
    }
    return { ready: false, mode: "supabase-postgres", latencyMs, error: "Unexpected probe result" };
  } catch (err) {
    isConnected = false;
    return {
      ready: false,
      mode: "supabase-postgres",
      latencyMs: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    isConnected = false;
  }
}
