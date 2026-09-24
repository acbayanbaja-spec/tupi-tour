# Production Deployment Manual — Tupi Tourist Spot Finder

A complete, production-grade guide for deploying the **Tupi Tourist Spot Finder & Navigation System** across **Supabase (Database)**, **Render (Backend API)**, and **Vercel (Next.js Frontend)**.

---

## 🏛️ System Architecture

```mermaid
flowchart LR
    A["Traveler / User Browser"] --> B["Vercel\nNext.js 14 App Router"]
    B -->|"/api rewrites / CORS"| C["Render\nExpress TypeScript API"]
    C -->|"PostgreSQL Pool (SSL)"| D["Supabase\nPostgreSQL & Storage"]
    C -.->|"Fallback if no DB"| E["Durable JSON Store\n(db.json)"]
```

---

## Step 1: Supabase (PostgreSQL Database Setup)

1. **Create a Supabase Project:**
   - Go to [supabase.com](https://supabase.com) and sign in.
   - Click **"New Project"**, name it `tupi-tour-db`, set an administrative database password, and select region **Southeast Asia (Singapore)** for lowest latency in the Philippines.

2. **Obtain your `DATABASE_URL`:**
   - In your project dashboard, navigate to **Project Settings** (gear icon) → **Database**.
   - Under **Connection String**, select the **URI** tab.
   - Choose **Transaction Pooler** (port `6543`) or **Session Pooler** (port `5432`).
   - Format:
     ```text
     postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
     ```
   - *Note:* Be sure to replace `[YOUR-PASSWORD]` with your actual Supabase DB password.

3. **Execute SQL Migrations:**
   - In Supabase, open the **SQL Editor** tab from the left navigation.
   - Click **"New query"**.
   - Open and copy the entire contents of [001_init.sql](file:///c:/Users/USER/OneDrive/Documents/Angel%20margarette/supabase/migrations/001_init.sql).
   - Paste it into the editor and click **Run**.
   - This creates all tables (`users`, `tourist_spots`, `reviews`, `trips`, `rewards`, `notifications`, `app_state`, etc.) with proper foreign keys, constraints, and indexes.

---

## Step 2: Render (Backend API Deployment)

1. **Create a New Web Service:**
   - Go to [render.com](https://render.com) and log in.
   - Click **"New +"** → **"Web Service"**.
   - Connect your GitHub repository containing this project.

2. **Configure Service Settings:**
   - **Name:** `tupi-tour-api`
   - **Region:** Singapore (Southeast Asia)
   - **Root Directory:** `backend` *(Crucial: tell Render to build inside backend/)*
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free or Starter

3. **Set Environment Variables in Render:**
   Under the **Environment** tab, add the following key-value pairs:

   | Variable | Value | Notes |
   | --- | --- | --- |
   | `PORT` | `4000` | Render will also automatically set this |
   | `NODE_ENV` | `production` | Enables production optimizations |
   | `DATABASE_URL` | `postgresql://...` | Your Supabase URI from Step 1 |
   | `JWT_SECRET` | `generate-a-64-character-random-hex-string` | Secret for access tokens |
   | `JWT_REFRESH_SECRET` | `generate-another-64-character-random-hex-string` | Secret for refresh tokens |
   | `CORS_ORIGIN` | `https://your-app.vercel.app` | Your Vercel frontend URL (comma-separated if multiple) |
   | `GROQ_API_KEY` | *(Optional)* | For Tupi Guide AI chatbot |
   | `GEMINI_API_KEY` | *(Optional)* | Alternative AI key |

4. **Configure Health Check Path:**
   - In Render, scroll down to **Advanced** → **Health Check Path**.
   - Set it to: `/health`
   - Render will ping `https://your-api.onrender.com/health` to verify zero-downtime health before routing traffic.

5. **Deploy:**
   - Click **"Create Web Service"**.
   - Once deployed, copy your public service URL (e.g. `https://tupi-tour-api.onrender.com`).

---

## Step 3: Vercel (Next.js Frontend Deployment)

1. **Import Project to Vercel:**
   - Go to [vercel.com](https://vercel.com) and log in.
   - Click **"Add New..."** → **"Project"**.
   - Select your GitHub repository.

2. **Configure Project Settings:**
   - **Framework Preset:** `Next.js`
   - **Root Directory:** Click "Edit" and choose `frontend` *(Crucial)*.
   - **Build Command:** `next build` (default)
   - **Output Directory:** `.next` (default)

3. **Set Environment Variables in Vercel:**
   Under **Environment Variables**, add:

   | Variable | Value | Description |
   | --- | --- | --- |
   | `NEXT_PUBLIC_API_URL` | `https://tupi-tour-api.onrender.com` | Your live Render backend URL (no trailing slash) |
   | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | *(Optional)* | If empty, OpenStreetMap + OSRM runs automatically |

   *How it works seamlessly:* Next.js App Router uses internal rewrites (`/api/:path*` -> `NEXT_PUBLIC_API_URL/api/:path*`). This proxies requests server-side, eliminating browser cross-origin preflight issues!

4. **Deploy:**
   - Click **"Deploy"**.
   - Vercel will build and assign your production domain: `https://your-tupi-app.vercel.app`.

---

## Step 4: Final Connection & Verification Checklist

1. **Update Render CORS:**
   - Once your Vercel deployment URL is generated, go back to Render → Environment.
   - Ensure `CORS_ORIGIN` contains your live Vercel URL (e.g., `https://your-tupi-app.vercel.app`).
   - The backend also includes dynamic wildcard matching for `*.vercel.app`, ensuring preview branches work automatically.

2. **Test 1-Click Demo Accounts:**
   Visit your live Vercel frontend URL, go to `/login`, and test the 1-click demo buttons:
   - **Tourist Demo:** `tourist@tupi.tour` / `Tourist123!` → Explore spots, save trips, test rewards voucher generation.
   - **Owner Demo:** `owner@tupi.tour` / `Owner123!` → Host Workspace, destination listings, review responses.
   - **Admin Demo:** `admin@tupi.tour` / `AdminTupi2026!` → Municipal Command Center, KPI analytics, spot approvals, rewards management.

3. **Verify Database Synchronization:**
   - Open your Supabase Dashboard → **Table Editor**.
   - Check the `app_state` table to verify your live state is continuously synchronized.
   - When Render instances sleep or restart, all your user accounts, reviews, and bookings are safely preserved in Supabase.
