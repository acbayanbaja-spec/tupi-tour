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

  // Migration 1: Full Relational Schema & Backward-Compatible Type Harmonization
  if (!applied.has(1)) {
    console.log("📦 Applying Migration 001: Core Relational Schema & Type Harmonization...");
    await withTransaction(async (client) => {
      await client.query(`
        -- 1. Harmonize legacy UUID columns to TEXT (idempotent)
        -- In earlier versions of Tupi Tour, tables were defined with uuid primary keys.
        -- We safely convert uuid columns to text so both UUIDs and human-readable IDs ('user-admin', 'sp-sg-farm')
        -- coexist seamlessly without foreign key type incompatibility.
        DO $$ 
        DECLARE
            r RECORD;
            col RECORD;
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND data_type = 'uuid'
            ) THEN
                RAISE NOTICE 'Legacy UUID schema detected. Harmonizing columns to TEXT...';

                -- Drop foreign key constraints on public tables to allow altering column types
                FOR r IN (
                    SELECT tc.table_name, tc.constraint_name
                    FROM information_schema.table_constraints tc
                    WHERE tc.table_schema = 'public' 
                      AND tc.constraint_type = 'FOREIGN KEY'
                ) LOOP
                    EXECUTE 'ALTER TABLE public.' || quote_ident(r.table_name) || ' DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name) || ' CASCADE;';
                END LOOP;

                -- Drop defaults on uuid columns
                FOR col IN (
                    SELECT table_name, column_name 
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                      AND data_type = 'uuid'
                ) LOOP
                    EXECUTE 'ALTER TABLE public.' || quote_ident(col.table_name) || ' ALTER COLUMN ' || quote_ident(col.column_name) || ' DROP DEFAULT;';
                END LOOP;

                -- Convert UUID columns to TEXT
                FOR col IN (
                    SELECT table_name, column_name 
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                      AND data_type = 'uuid'
                ) LOOP
                    EXECUTE 'ALTER TABLE public.' || quote_ident(col.table_name) || ' ALTER COLUMN ' || quote_ident(col.column_name) || ' TYPE text USING ' || quote_ident(col.column_name) || '::text;';
                END LOOP;

                -- Set default to gen_random_uuid()::text for primary keys / id columns
                FOR col IN (
                    SELECT table_name, column_name 
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                      AND column_name = 'id' 
                      AND data_type = 'text'
                ) LOOP
                    EXECUTE 'ALTER TABLE public.' || quote_ident(col.table_name) || ' ALTER COLUMN ' || quote_ident(col.column_name) || ' SET DEFAULT gen_random_uuid()::text;';
                END LOOP;

                RAISE NOTICE 'Legacy UUID harmonization complete.';
            END IF;
        END $$;

        -- 2. Users Table
        CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
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

        -- 3. Categories Table
        CREATE TABLE IF NOT EXISTS categories (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          slug text UNIQUE NOT NULL,
          name text NOT NULL,
          description text,
          icon text
        );

        -- 4. Tourist Spots Table with Verification & Safety Fields
        CREATE TABLE IF NOT EXISTS tourist_spots (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
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

        -- Ensure newly added columns exist on pre-existing tourist_spots table
        ALTER TABLE tourist_spots ADD COLUMN IF NOT EXISTS last_verified_at timestamptz DEFAULT now();
        ALTER TABLE tourist_spots ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'verified';
        ALTER TABLE tourist_spots ADD COLUMN IF NOT EXISTS verified_by text;
        ALTER TABLE tourist_spots ADD COLUMN IF NOT EXISTS safety_guidance jsonb NOT NULL DEFAULT '[]';
        ALTER TABLE tourist_spots ADD COLUMN IF NOT EXISTS emergency_contact text;

        CREATE INDEX IF NOT EXISTS idx_spots_status ON tourist_spots(status);
        CREATE INDEX IF NOT EXISTS idx_spots_category ON tourist_spots(category_id);
        CREATE INDEX IF NOT EXISTS idx_spots_owner ON tourist_spots(owner_id);
        CREATE INDEX IF NOT EXISTS idx_spots_geo ON tourist_spots(lat, lng);

        -- 5. Tourist Spot Images
        CREATE TABLE IF NOT EXISTS tourist_spot_images (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          spot_id text NOT NULL REFERENCES tourist_spots(id) ON DELETE CASCADE,
          url text NOT NULL,
          alt text NOT NULL,
          sort_order integer NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_spot_images_spot ON tourist_spot_images(spot_id);

        -- 6. Favorites
        CREATE TABLE IF NOT EXISTS favorites (
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          spot_id text NOT NULL REFERENCES tourist_spots(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, spot_id)
        );

        -- 7. Reviews
        CREATE TABLE IF NOT EXISTS reviews (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS helpful_by jsonb NOT NULL DEFAULT '[]';
        CREATE INDEX IF NOT EXISTS idx_reviews_spot ON reviews(spot_id);

        -- 8. Trips & Trip Destinations
        CREATE TABLE IF NOT EXISTS trips (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name text NOT NULL,
          notes text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS trip_destinations (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          spot_id text NOT NULL REFERENCES tourist_spots(id) ON DELETE CASCADE,
          sort_order integer NOT NULL DEFAULT 0
        );

        -- 9. Saved Multi-Stop Routes (Feature 2)
        CREATE TABLE IF NOT EXISTS saved_routes (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name text NOT NULL,
          stops jsonb NOT NULL DEFAULT '[]',
          total_distance_km double precision NOT NULL DEFAULT 0,
          estimated_minutes integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        -- 10. Rewards
        CREATE TABLE IF NOT EXISTS rewards (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          name text NOT NULL,
          description text NOT NULL,
          points_cost integer NOT NULL CHECK (points_cost > 0),
          stock integer NOT NULL DEFAULT 50 CHECK (stock >= 0),
          active boolean NOT NULL DEFAULT true
        );

        -- 11. Vouchers (Feature 5: Secure Reward Wallet & Verifiable Vouchers)
        CREATE TABLE IF NOT EXISTS vouchers (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
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

        -- 12. User Rewards (Legacy / Redemption History)
        CREATE TABLE IF NOT EXISTS user_rewards (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reward_id text NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
          voucher_id text REFERENCES vouchers(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        ALTER TABLE user_rewards ADD COLUMN IF NOT EXISTS voucher_id text;

        -- 13. Points Transactions
        CREATE TABLE IF NOT EXISTS points_transactions (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          amount integer NOT NULL,
          reason text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_points_user ON points_transactions(user_id);

        -- 14. Badges
        CREATE TABLE IF NOT EXISTS badges (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
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

        -- 15. Notifications
        CREATE TABLE IF NOT EXISTS notifications (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title text NOT NULL,
          body text NOT NULL,
          type text NOT NULL,
          read boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

        -- 16. Verified Visits / Check-ins
        CREATE TABLE IF NOT EXISTS visits (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          spot_id text NOT NULL REFERENCES tourist_spots(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_visits_user_spot ON visits(user_id, spot_id);

        -- 17. Owner Verifications
        CREATE TABLE IF NOT EXISTS owner_verifications (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          business_name text NOT NULL,
          notes text,
          document_url text,
          status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected')),
          created_at timestamptz NOT NULL DEFAULT now(),
          reviewed_at timestamptz
        );

        -- 18. Reports
        CREATE TABLE IF NOT EXISTS reports (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id text REFERENCES users(id) ON DELETE SET NULL,
          target_type text NOT NULL,
          target_id text NOT NULL,
          reason text NOT NULL,
          status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
          created_at timestamptz NOT NULL DEFAULT now()
        );

        -- 19. Audit Logs
        CREATE TABLE IF NOT EXISTS audit_logs (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          actor_id text,
          action text NOT NULL,
          meta jsonb NOT NULL DEFAULT '{}',
          created_at timestamptz NOT NULL DEFAULT now()
        );

        -- 20. Refresh Tokens
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash text UNIQUE NOT NULL,
          expires_at timestamptz NOT NULL,
          revoked boolean NOT NULL DEFAULT false
        );

        -- 21. Password Resets
        CREATE TABLE IF NOT EXISTS password_resets (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash text UNIQUE NOT NULL,
          expires_at timestamptz NOT NULL,
          used boolean NOT NULL DEFAULT false
        );

        -- 22. Search Analytics Events
        CREATE TABLE IF NOT EXISTS search_events (
          id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
          query text NOT NULL,
          user_id text,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        -- 23. Idempotent Foreign Key Verification & Restoration
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'tourist_spots_category_id_fkey') THEN
            ALTER TABLE tourist_spots ADD CONSTRAINT tourist_spots_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'tourist_spots_owner_id_fkey') THEN
            ALTER TABLE tourist_spots ADD CONSTRAINT tourist_spots_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'tourist_spot_images_spot_id_fkey') THEN
            ALTER TABLE tourist_spot_images ADD CONSTRAINT tourist_spot_images_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES tourist_spots(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'favorites_user_id_fkey') THEN
            ALTER TABLE favorites ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'favorites_spot_id_fkey') THEN
            ALTER TABLE favorites ADD CONSTRAINT favorites_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES tourist_spots(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'reviews_user_id_fkey') THEN
            ALTER TABLE reviews ADD CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'reviews_spot_id_fkey') THEN
            ALTER TABLE reviews ADD CONSTRAINT reviews_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES tourist_spots(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'trips_user_id_fkey') THEN
            ALTER TABLE trips ADD CONSTRAINT trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'trip_destinations_trip_id_fkey') THEN
            ALTER TABLE trip_destinations ADD CONSTRAINT trip_destinations_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'trip_destinations_spot_id_fkey') THEN
            ALTER TABLE trip_destinations ADD CONSTRAINT trip_destinations_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES tourist_spots(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'user_rewards_user_id_fkey') THEN
            ALTER TABLE user_rewards ADD CONSTRAINT user_rewards_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'user_rewards_reward_id_fkey') THEN
            ALTER TABLE user_rewards ADD CONSTRAINT user_rewards_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE RESTRICT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'points_transactions_user_id_fkey') THEN
            ALTER TABLE points_transactions ADD CONSTRAINT points_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'user_badges_user_id_fkey') THEN
            ALTER TABLE user_badges ADD CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'user_badges_badge_id_fkey') THEN
            ALTER TABLE user_badges ADD CONSTRAINT user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'notifications_user_id_fkey') THEN
            ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'visits_user_id_fkey') THEN
            ALTER TABLE visits ADD CONSTRAINT visits_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'visits_spot_id_fkey') THEN
            ALTER TABLE visits ADD CONSTRAINT visits_spot_id_fkey FOREIGN KEY (spot_id) REFERENCES tourist_spots(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'owner_verifications_user_id_fkey') THEN
            ALTER TABLE owner_verifications ADD CONSTRAINT owner_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'reports_user_id_fkey') THEN
            ALTER TABLE reports ADD CONSTRAINT reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'refresh_tokens_user_id_fkey') THEN
            ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_name = 'password_resets_user_id_fkey') THEN
            ALTER TABLE password_resets ADD CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
        END $$;

        INSERT INTO schema_migrations (version, name) VALUES (1, '001_core_relational_schema');
      `);
    });
    console.log("✅ Migration 001 applied successfully.");
  }

  // Migration 2: Data Import & Safe Seeding
  if (!applied.has(2)) {
    console.log("📦 Applying Migration 002: Seed & Import Initial Relational Data...");
    await withTransaction(async (client) => {
      // 0. Check and migrate from legacy app_state if present and tables are empty
      try {
        const appStateRes = await client.query("SELECT data FROM app_state WHERE key = 'main' LIMIT 1");
        if (appStateRes.rows.length > 0 && appStateRes.rows[0].data) {
          const legacy = appStateRes.rows[0].data;
          console.log("Found legacy app_state in Supabase. Checking records to import...");

          const uCount = await client.query("SELECT COUNT(*) FROM users");
          if (parseInt(uCount.rows[0].count, 10) === 0 && Array.isArray(legacy.users)) {
            for (const u of legacy.users) {
              await client.query(
                `INSERT INTO users (id, email, password_hash, name, role, interests, onboarding_complete, email_verified, points, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 ON CONFLICT (email) DO NOTHING`,
                [
                  u.id,
                  u.email,
                  u.passwordHash,
                  u.name,
                  u.role || "tourist",
                  JSON.stringify(u.interests || []),
                  u.onboardingComplete ?? true,
                  u.emailVerified ?? true,
                  u.points || 0,
                  u.createdAt || new Date().toISOString(),
                  u.updatedAt || new Date().toISOString(),
                ]
              );
            }
          }

          const sCount = await client.query("SELECT COUNT(*) FROM tourist_spots");
          if (parseInt(sCount.rows[0].count, 10) === 0 && Array.isArray(legacy.spots)) {
            for (const sp of legacy.spots) {
              await client.query(
                `INSERT INTO tourist_spots 
                 (id, slug, name, category_id, description, short_description, lat, lng, address, barangay, amenities, operating_hours, contact, featured, status, owner_id, data_source, estimated_entrance_fee, popularity_score, view_count, visit_count, last_verified_at, verification_status, safety_guidance, emergency_contact, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, now(), 'verified', $22, $23, $24, $25)
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
                  sp.ownerId || null,
                  sp.dataSource || "curated",
                  sp.estimatedEntranceFee || null,
                  sp.popularityScore || 0,
                  sp.viewCount || 0,
                  sp.visitCount || 0,
                  JSON.stringify(sp.safetyGuidance || ["Wear sturdy shoes", "Carry rain gear", "Respect farm produce"]),
                  sp.emergencyContact || "MDRRMO Tupi: (083) 228-1000",
                  sp.createdAt || new Date().toISOString(),
                  sp.updatedAt || new Date().toISOString(),
                ]
              );
            }
          }
        }
      } catch (err) {
        // app_state table may not exist, safely continue
      }

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
