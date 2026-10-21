-- Tupi Tourist Spot Finder — Supabase PostgreSQL Authoritative Schema
-- Safe, repeatable, fully relational migrations with foreign keys, checks, indexes and constraints

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Migration Tracking Table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Users Table
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

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  icon text
);

-- Tourist Spots Table with Verification & Safety Fields
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

CREATE INDEX IF NOT EXISTS idx_spots_status ON tourist_spots(status);
CREATE INDEX IF NOT EXISTS idx_spots_category ON tourist_spots(category_id);
CREATE INDEX IF NOT EXISTS idx_spots_owner ON tourist_spots(owner_id);
CREATE INDEX IF NOT EXISTS idx_spots_geo ON tourist_spots(lat, lng);

-- Tourist Spot Images
CREATE TABLE IF NOT EXISTS tourist_spot_images (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
CREATE INDEX IF NOT EXISTS idx_reviews_spot ON reviews(spot_id);

-- Trips & Trip Destinations
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

-- Saved Multi-Stop Routes (Feature 2)
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

-- Rewards
CREATE TABLE IF NOT EXISTS rewards (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  description text NOT NULL,
  points_cost integer NOT NULL CHECK (points_cost > 0),
  stock integer NOT NULL DEFAULT 50 CHECK (stock >= 0),
  active boolean NOT NULL DEFAULT true
);

-- Vouchers (Feature 5: Secure Reward Wallet & Verifiable Vouchers)
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

-- User Rewards (Redemption History)
CREATE TABLE IF NOT EXISTS user_rewards (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id text NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
  voucher_id text REFERENCES vouchers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Points Transactions
CREATE TABLE IF NOT EXISTS points_transactions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_points_user ON points_transactions(user_id);

-- Badges
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

-- Notifications
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

-- Verified Visits
CREATE TABLE IF NOT EXISTS visits (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot_id text NOT NULL REFERENCES tourist_spots(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visits_user_spot ON visits(user_id, spot_id);

-- Owner Verifications
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

-- Reports
CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_id text,
  action text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false
);

-- Password Resets
CREATE TABLE IF NOT EXISTS password_resets (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false
);

-- Search Analytics Events
CREATE TABLE IF NOT EXISTS search_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  query text NOT NULL,
  user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
