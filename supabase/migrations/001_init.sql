-- Tupi Tourist Spot Finder — Supabase PostgreSQL Authoritative Schema
-- Safe, repeatable, fully relational migrations with foreign keys, checks, indexes and constraints

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Migration Tracking Table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

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
