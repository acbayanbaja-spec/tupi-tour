# Tupi Tourist Spot Finder and Navigation System

A production-oriented tourism discovery, maps, itinerary, rewards, and admin platform **focused on Tupi, South Cotabato**.

## Architecture

- **Frontend:** Next.js (App Router) on Vercel
- **Backend:** Express + TypeScript on Render
- **Database:** Supabase PostgreSQL (`DATABASE_URL`). Local development falls back to a durable JSON store if Postgres is not configured.
- **Maps:** Google Maps when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set; OpenStreetMap + OSRM otherwise
- **Chatbot:** Groq / Gemini when keys exist; otherwise a free public LLM endpoint, then a local Tupi knowledge assistant

## Local development

```bash
# backend
cd backend
copy .env.example .env
npm install
npm run dev

# frontend (second terminal)
cd frontend
copy .env.example .env.local
npm install
npm run dev
```

Frontend: http://localhost:3000  
Backend: http://localhost:4000

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@tupi.tour | AdminTupi2026! |
| Owner | owner@tupi.tour | Owner123! |
| Tourist | tourist@tupi.tour | Tourist123! |

## Production

See `.env.example` files in `frontend/` and `backend/` plus `docs/DEPLOYMENT.md`.
