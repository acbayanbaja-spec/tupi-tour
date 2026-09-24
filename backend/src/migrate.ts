import { readFileSync, existsSync } from "fs";
import path from "path";
import pg from "pg";
import { config } from "./config.js";
import { initDb, store } from "./store.js";

const { Pool } = pg;

async function runMigration() {
  console.log("--------------------------------------------------");
  console.log("🚀 Tupi Tour — Supabase Database Migration & Sync");
  console.log("--------------------------------------------------");

  if (!config.databaseUrl) {
    console.error("❌ Error: DATABASE_URL is not set in backend/.env");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    console.log("⏳ Connecting to Supabase PostgreSQL...");
    const client = await pool.connect();
    console.log("✅ Successfully connected to Supabase!");

    const verRes = await client.query("SELECT version();");
    console.log("🐘 PostgreSQL Version:", verRes.rows[0].version.split(",")[0]);

    // 1. Locate and run 001_init.sql if available
    const migrationPath = path.resolve(process.cwd(), "../supabase/migrations/001_init.sql");
    const localMigrationPath = path.resolve(process.cwd(), "supabase/migrations/001_init.sql");
    const targetPath = existsSync(migrationPath) ? migrationPath : existsSync(localMigrationPath) ? localMigrationPath : null;

    if (targetPath) {
      console.log(`📄 Executing migration script from ${targetPath}...`);
      const sql = readFileSync(targetPath, "utf8");
      await client.query(sql);
      console.log("✅ Executed 001_init.sql successfully.");
    } else {
      console.log("ℹ️ 001_init.sql not found at standard path, ensuring app_state table exists...");
    }

    // 2. Ensure app_state table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        key text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz DEFAULT NOW()
      );
    `);
    console.log("✅ app_state table verified.");

    // 3. Initialize store & seed data into Postgres
    console.log("🌱 Initializing store & seeding database state...");
    client.release();
    await initDb();

    // 4. Query tables list to verify schema
    const checkClient = await pool.connect();
    const tablesRes = await checkClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    checkClient.release();

    const tableNames = tablesRes.rows.map((r) => r.table_name);
    console.log("\n📋 Tables currently active in public schema:");
    tableNames.forEach((t) => console.log(`   - ${t}`));

    console.log("\n🎉 Database setup and synchronization complete!");
    console.log("Your Supabase database is 100% ready for production deployment on Render & Vercel.");
    console.log("--------------------------------------------------");
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed with error:", err);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
