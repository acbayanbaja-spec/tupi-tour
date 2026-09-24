-- Tupi Tourist Spot Finder — Supabase PostgreSQL schema
create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('tourist', 'owner', 'admin')),
  avatar_url text,
  phone text,
  bio text,
  interests jsonb not null default '[]',
  budget_preference text,
  trip_style text,
  onboarding_complete boolean not null default false,
  email_verified boolean not null default false,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  icon text
);

create table if not exists tourist_spots (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category_id uuid references categories(id),
  description text not null,
  short_description text not null,
  lat double precision not null,
  lng double precision not null,
  address text not null,
  barangay text not null,
  amenities jsonb not null default '[]',
  operating_hours jsonb,
  contact text,
  featured boolean not null default false,
  status text not null default 'approved' check (status in ('draft','pending','under_review','approved','rejected')),
  owner_id uuid references users(id),
  data_source text not null default 'curated',
  estimated_entrance_fee numeric,
  popularity_score integer not null default 0,
  view_count integer not null default 0,
  visit_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tourist_spots_status_idx on tourist_spots(status);
create index if not exists tourist_spots_category_idx on tourist_spots(category_id);
create index if not exists tourist_spots_geo_idx on tourist_spots(lat, lng);

create table if not exists tourist_spot_images (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references tourist_spots(id) on delete cascade,
  url text not null,
  alt text not null,
  sort_order integer not null default 0
);

create table if not exists owner_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  business_name text not null,
  notes text,
  document_url text,
  status text not null default 'submitted' check (status in ('submitted','under_review','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists favorites (
  user_id uuid not null references users(id) on delete cascade,
  spot_id uuid not null references tourist_spots(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, spot_id)
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  spot_id uuid not null references tourist_spots(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null,
  photos jsonb not null default '[]',
  helpful_count integer not null default 0,
  owner_reply text,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  unique (user_id, spot_id)
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_destinations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  spot_id uuid not null references tourist_spots(id),
  sort_order integer not null default 0
);

create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  points_cost integer not null,
  stock integer not null default 50,
  active boolean not null default true
);

create table if not exists user_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  reward_id uuid not null references rewards(id),
  created_at timestamptz not null default now()
);

create table if not exists points_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists badges (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null
);

create table if not exists user_badges (
  user_id uuid not null references users(id),
  badge_id uuid not null references badges(id),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  spot_id uuid not null references tourist_spots(id),
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  target_type text not null,
  target_id text not null,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked boolean not null default false
);

create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used boolean not null default false
);
