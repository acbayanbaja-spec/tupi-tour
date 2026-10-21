import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { badgeSeed, categorySeed, rewardSeed, spotSeed } from "../seedData.js";
import { getPool, withTransaction } from "./pool.js";

export async function runMigrations(): Promise<void> {
  const pool = getPool();
  if (!pool) {
    if (config.isProduction) {
      throw new Error("DATABASE_URL is required to run migrations in production.");
    }
    console.log("ℹ️ Skipping PostgreSQL migrations: DATABASE_URL not set in non-production.");
    return;
  }

  console.log("--------------------------------------------------");
  console.log("🚀 Tupi Tour — Running PostgreSQL Schema Migrations");
  console.log("--------------------------------------------------");

  // Ensure schema_migrations table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const appliedRes = await pool.query<{ version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version ASC"
  );
  const applied = new Set(appliedRes.rows.map((r) => r.version));

  // Migration 1: Full Relational Schema
  if (!applied.has(1)) {
    console.log("📦 Applying Migration 001: Core Relational Schema...");
    await withTransaction(async (client) => {
      await client.query(`
        -- Users Table
        CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY,
          email text UNIQUE NOT NULL,
          password_hash text NOT NULL,
          name text NOT NULL,
          role text NOT NULL CHECK (role IN ('tourist', 'owner', 'admin')),
          avatar_url text,
          phone text,
          bio text,
          interests jsonb NOT NULL DEFAULT '[]',
          budget_preference text,
          trip_style text,
          onboarding_complete boolean NOT NULL DEFAULT false,
          email_verified boolean NOT NULL DEFAULT false,
          points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        -- Categories Table
        CREATE TABLE IF NOT EXISTS categories (
          id text PRIMARY KEY,
          slug text UNIQUE NOT NULL,
          name text NOT NULL,
          description text,
          icon text
        );

        -- Tourist Spots Table with Verification & Safety Fields
        CREATE TABLE IF NOT EXISTS tourist_spots (
          id text PRIMARY KEY,
          slug text UNIQUE NOT NULL,
          name text NOT NULL,
          category_id text REFERENCES categories(id) ON DELETE SET NULL,
          description text NOT NULL,
          short_description text NOT NULL,
          lat double precision NOT NULL,
          lng double precision NOT NULL,
          address text NOT NULL,
          barangay text NOT NULL,
          amenities jsonb NOT NULL DEFAULT '[]',
          operating_hours jsonb,
          contact text,
          featured boolean NOT NULL DEFAULT false,
          status text NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'pending', 'under_review', 'approved', 'rejected')),
          owner_id text REFERENCES users(id) ON DELETE SET NULL,
          data_source text NOT NULL DEFAULT 'curated',
          estimated_entrance_fee numeric,
          popularity_score integer NOT NULL DEFAULT 0,
          view_count integer NOT NULL DEFAULT 0,
          visit_count integer NOT NULL DEFAULT 0,
          last_verified_at timestamptz DEFAULT now(),
          verification_status text NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('verified', 'unverified', 'outdated', 'under_review')),
          verified_by text REFERENCES users(id) ON DELETE SET NULL,
          safety_guidance jsonb NOT NULL DEFAULT '[]',
          emergency_contact text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_spots_status ON tourist_spots(status);
        CREATE INDEX IF NOT EXISTS idx_spots_category ON tourist_spots(category_id);
        CREATE INDEX IF NOT EXISTS idx_spots_owner ON tourist_spots(owner_id);
        CREATE INDEX IF NOT EXISTS idx_spots_geo ON tourist_spots(lat, lng);

        -- Tourist Spot Images
        CREATE TABLE IF NOT EXISTS tourist_spot_images (
          id text PRIMARY KEY,
          spot_id text NOT NULL REFERENCES tourist_spots(id) ON DELETE CASCADE,
          url text NOT NULL,
          alt text NOT NULL,
          sort_order integer NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_spot_images_spot ON tourist_spot_images(spot_id);

        -- Favorites
        CREATE TABLE IF NOT EXISTS favorites (
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          spot_id text NOT NULL REFERENCES tourist_spots(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, spot_id)
        );

        -- Reviews
        CREATE TABLE IF NOT EXISTS reviews (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          spot_id text NOT NULL REFERENCES tourist_spots(id) ON DELETE CASCADE,
          rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
          body text NOT NULL,
          photos jsonb NOT NULL DEFAULT '[]',
          helpful_count integer NOT NULL DEFAULT 0,
          helpful_by jsonb NOT NULL DEFAULT '[]',
          owner_reply text,
          status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (user_id, spot_id)
        );
        CREATE INDEX IF NOT EXISTS idx_reviews_spot ON reviews(spot_id);

        -- Trips & Trip Destinations
        CREATE TABLE IF NOT EXISTS trips (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name text NOT NULL,
          notes text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS trip_destinations (
          id text PRIMARY KEY,
          trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          spot_id text NOT NULL REFERENCES tourist_spots(id) ON DELETE CASCADE,
          sort_order integer NOT NULL DEFAULT 0
        );

        -- Saved Multi-Stop Routes (Feature 2)
        CREATE TABLE IF NOT EXISTS saved_routes (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name text NOT NULL,
          stops jsonb NOT NULL DEFAULT '[]',
          total_distance_km double precision NOT NULL DEFAULT 0,
          estimated_minutes integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        -- Rewards
        CREATE TABLE IF NOT EXISTS rewards (
          id text PRIMARY KEY,
          name text NOT NULL,
          description text NOT NULL,
          points_cost integer NOT NULL CHECK (points_cost > 0),
          stock integer NOT NULL DEFAULT 50 CHECK (stock >= 0),
          active boolean NOT NULL DEFAULT true
        );

        -- Vouchers (Feature 5: Secure Reward Wallet & Verifiable Vouchers)
        CREATE TABLE IF NOT EXISTS vouchers (
          id text PRIMARY KEY,
          code text UNIQUE NOT NULL,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reward_id text NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
          status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'cancelled')),
          expires_at timestamptz NOT NULL,
          redeemed_at timestamptz,
          redeemed_by text REFERENCES users(id) ON DELETE SET NULL,
          idempotency_key text UNIQUE,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_vouchers_user ON vouchers(user_id);
        CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
        CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);

        -- User Rewards (Legacy / Redemption History)
        CREATE TABLE IF NOT EXISTS user_rewards (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reward_id text NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
          voucher_id text REFERENCES vouchers(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        -- Points Transactions
        CREATE TABLE IF NOT EXISTS points_transactions (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          amount integer NOT NULL,
          reason text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_points_user ON points_transactions(user_id);

        -- Badges
        CREATE TABLE IF NOT EXISTS badges (
          id text PRIMARY KEY,
          slug text UNIQUE NOT NULL,
          name text NOT NULL,
          description text NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_badges (
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          badge_id text NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
          earned_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, badge_id)
        );

        -- Notifications
        CREATE TABLE IF NOT EXISTS notifications (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title text NOT NULL,
          body text NOT NULL,
          type text NOT NULL,
          read boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

        -- Verified Visits / Check-ins
        CREATE TABLE IF NOT EXISTS visits (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          spot_id text NOT NULL REFERENCES tourist_spots(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_visits_user_spot ON visits(user_id, spot_id);

        -- Owner Verifications
        CREATE TABLE IF NOT EXISTS owner_verifications (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          business_name text NOT NULL,
          notes text,
          document_url text,
          status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected')),
          created_at timestamptz NOT NULL DEFAULT now(),
          reviewed_at timestamptz
        );

        -- Reports
        CREATE TABLE IF NOT EXISTS reports (
          id text PRIMARY KEY,
          user_id text REFERENCES users(id) ON DELETE SET NULL,
          target_type text NOT NULL,
          target_id text NOT NULL,
          reason text NOT NULL,
          status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
          created_at timestamptz NOT NULL DEFAULT now()
        );

        -- Audit Logs
        CREATE TABLE IF NOT EXISTS audit_logs (
          id text PRIMARY KEY,
          actor_id text,
          action text NOT NULL,
          meta jsonb NOT NULL DEFAULT '{}',
          created_at timestamptz NOT NULL DEFAULT now()
        );

        -- Refresh Tokens
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash text UNIQUE NOT NULL,
          expires_at timestamptz NOT NULL,
          revoked boolean NOT NULL DEFAULT false
        );

        -- Password Resets
        CREATE TABLE IF NOT EXISTS password_resets (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash text UNIQUE NOT NULL,
          expires_at timestamptz NOT NULL,
          used boolean NOT NULL DEFAULT false
        );

        -- Search Analytics Events
        CREATE TABLE IF NOT EXISTS search_events (
          id text PRIMARY KEY,
          query text NOT NULL,
          user_id text,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        INSERT INTO schema_migrations (version, name) VALUES (1, '001_core_relational_schema');
      `);
    });
    console.log("✅ Migration 001 applied successfully.");
  }

  // Migration 2: Data Import & Safe Seeding
  if (!applied.has(2)) {
    console.log("📦 Applying Migration 002: Seed & Import Initial Relational Data...");
    await withTransaction(async (client) => {
      // 1. Check if categories exist
      const catCount = await client.query("SELECT COUNT(*) FROM categories");
      if (parseInt(catCount.rows[0].count, 10) === 0) {
        for (const cat of categorySeed()) {
          await client.query(
            "INSERT INTO categories (id, slug, name, description, icon) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (slug) DO NOTHING",
            [cat.id, cat.slug, cat.name, cat.description, cat.icon]
          );
        }
      }

      // 2. Check if badges exist
      const badgeCount = await client.query("SELECT COUNT(*) FROM badges");
      if (parseInt(badgeCount.rows[0].count, 10) === 0) {
        for (const bd of badgeSeed) {
          await client.query(
            "INSERT INTO badges (id, slug, name, description) VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING",
            [bd.id, bd.slug, bd.name, bd.description]
          );
        }
      }

      // 3. Check if rewards exist
      const rewardCount = await client.query("SELECT COUNT(*) FROM rewards");
      if (parseInt(rewardCount.rows[0].count, 10) === 0) {
        for (const rw of rewardSeed()) {
          await client.query(
            "INSERT INTO rewards (id, name, description, points_cost, stock, active) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING",
            [rw.id, rw.name, rw.description, rw.pointsCost, rw.stock, rw.active]
          );
        }
      }

      // 4. Check if demo users exist
      const userCount = await client.query("SELECT COUNT(*) FROM users");
      if (parseInt(userCount.rows[0].count, 10) === 0) {
        const hash = async (pwd: string) => bcrypt.hash(pwd, 12);
        const adminHash = await hash("AdminTupi2026!");
        const ownerHash = await hash("Owner123!");
        const touristHash = await hash("Tourist123!");

        await client.query(
          `INSERT INTO users (id, email, password_hash, name, role, interests, onboarding_complete, email_verified, points)
           VALUES 
           ('user-admin', 'admin@tupi.tour', $1, 'Tupi Tourism Admin', 'admin', '[]', true, true, 0),
           ('user-owner', 'owner@tupi.tour', $2, 'Kablon Farm Owner', 'owner', '["agri-tourism"]', true, true, 40),
           ('user-tourist', 'tourist@tupi.tour', $3, 'Ana Explorer', 'tourist', '["nature", "agri-tourism"]', true, true, 160)
           ON CONFLICT (email) DO NOTHING`,
          [adminHash, ownerHash, touristHash]
        );

        await client.query(
          `INSERT INTO owner_verifications (id, user_id, business_name, notes, status, reviewed_at)
           VALUES ('ov-demo', 'user-owner', 'Glandang Highland Farm', 'Demo owner account for SG Farm area.', 'approved', now())
           ON CONFLICT (id) DO NOTHING`
        );
      }

      // 5. Check if tourist spots exist
      const spotCount = await client.query("SELECT COUNT(*) FROM tourist_spots");
      if (parseInt(spotCount.rows[0].count, 10) === 0) {
        for (const sp of spotSeed()) {
          await client.query(
            `INSERT INTO tourist_spots 
             (id, slug, name, category_id, description, short_description, lat, lng, address, barangay, amenities, operating_hours, contact, featured, status, owner_id, data_source, estimated_entrance_fee, popularity_score, view_count, visit_count, last_verified_at, verification_status, safety_guidance, emergency_contact)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, now(), 'verified', $22, $23)
             ON CONFLICT (slug) DO NOTHING`,
            [
              sp.id,
              sp.slug,
              sp.name,
              sp.categoryId,
              sp.description,
              sp.shortDescription,
              sp.lat,
              sp.lng,
              sp.address,
              sp.barangay,
              JSON.stringify(sp.amenities || []),
              JSON.stringify(sp.operatingHours || {}),
              sp.contact || null,
              sp.featured || false,
              sp.status || "approved",
              sp.ownerId || (sp.id === "sp-sg-farm" ? "user-owner" : null),
              sp.dataSource || "curated",
              sp.estimatedEntranceFee || null,
              sp.popularityScore || 0,
              sp.viewCount || 0,
              sp.visitCount || 0,
              JSON.stringify(["Wear sturdy shoes", "Carry rain gear", "Respect farm produce"]),
              "MDRRMO Tupi: (083) 228-1000",
            ]
          );

          // Insert images
          if (sp.images?.length) {
            for (let i = 0; i < sp.images.length; i++) {
              const img = sp.images[i];
              await client.query(
                "INSERT INTO tourist_spot_images (id, spot_id, url, alt, sort_order) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING",
                [`${sp.id}-img-${i}`, sp.id, img.url, img.alt, i]
              );
            }
          }
        }
      }

      await client.query("INSERT INTO schema_migrations (version, name) VALUES (2, '002_seed_initial_relational_data')");
    });
    console.log("✅ Migration 002 applied successfully.");
  }

  console.log("🎉 All PostgreSQL migrations completed and verified.");
  console.log("--------------------------------------------------");
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration error:", err);
      process.exit(1);
    });
}
