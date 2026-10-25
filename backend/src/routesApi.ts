import { randomUUID } from "crypto";
import { type Request, type Response, Router } from "express";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { optionalAuth, requireAuth, requireRole, type AuthedRequest } from "./auth.js";
import { chatTupi } from "./chatbot.js";
import { config } from "./config.js";
import { checkDbReadiness } from "./db/pool.js";
import { enrichSpot, enrichSpots, fetchRoadRoute, haversineKm, isWithinPhilippines, isWithinTupi, recommend, searchSpots, TUPI_BOUNDS, TUPI_CENTER, TUPI_BARANGAYS } from "./geo.js";
import { buildItinerary } from "./itinerary.js";
import { spotRating, store } from "./store.js";
import type { SavedRoute, TouristSpot, VerificationStatus } from "./types.js";
import { getTupiWeather } from "./weather.js";

export const api = Router();

const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    if (!ok) {
      cb(new Error("Only JPEG, PNG, or WebP images are allowed."));
    } else {
      cb(null, true);
    }
  },
});

function originFrom(req: { query: Record<string, unknown> }) {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return undefined;
}

// Phase 2.E: Process health (liveness)
api.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "tupi-tour-api",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
});

// Phase 2.E: Database readiness check (does not expose credentials)
api.get("/ready", async (_req, res) => {
  const readiness = await checkDbReadiness();
  if (!readiness.ready) {
    return res.status(503).json({
      status: "unready",
      database: readiness.mode,
      error: readiness.error || "Database probe failed",
      timestamp: new Date().toISOString(),
    });
  }
  res.json({
    status: "ready",
    database: readiness.mode,
    latencyMs: readiness.latencyMs,
    storage: store.isUsingPostgres() ? "postgresql-authoritative" : "isolated-dev-fallback",
    timestamp: new Date().toISOString(),
  });
});

// Categories
api.get("/categories", async (_req, res) => {
  const categories = await store.categories();
  res.json({ categories });
});

// Spots Listing
api.get("/spots", optionalAuth, async (req: AuthedRequest, res) => {
  const q = String(req.query.q || "");
  const category = String(req.query.category || "");
  const sort = String(req.query.sort || "popular");
  const featured = String(req.query.featured || "");
  const origin = originFrom(req);

  let spots = await store.spots("approved");
  const allCats = await store.categories();

  if (category) {
    spots = spots.filter(
      (s) => s.categoryId === category || allCats.find((c) => c.id === s.categoryId)?.slug === category
    );
  }
  if (featured === "true") {
    spots = spots.filter((s) => s.featured);
  }
  if (q) {
    await store.logSearch(q, req.user?.id);
    spots = searchSpots(q, spots);
  }

  const enriched = await enrichSpots(spots, req.user?.id, origin);
  enriched.sort((a, b) => {
    if (sort === "rating") return b.rating.average - a.rating.average;
    if (sort === "distance" && origin) return (a.distanceKm || 99) - (b.distanceKm || 99);
    if (sort === "name") return a.name.localeCompare(b.name);
    return b.popularityScore - a.popularityScore;
  });

  res.json({ spots: enriched });
});

// Single Spot Details
api.get("/spots/:id", optionalAuth, async (req: AuthedRequest, res) => {
  const spot = await store.getSpot(req.params.id);
  if (!spot || spot.status !== "approved") {
    return res.status(404).json({ error: "That destination is not available." });
  }

  await store.bumpViews(spot.id);
  const origin = originFrom(req);

  const allApproved = await store.spots("approved");
  const nearbySpots = allApproved
    .filter((s) => s.id !== spot.id)
    .map((s) => ({ s, km: haversineKm(spot, s) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 5)
    .map((x) => x.s);

  const nearbyEnriched = await enrichSpots(nearbySpots, req.user?.id, origin || spot);
  const rawReviews = await store.reviewsForSpot(spot.id);

  const reviews = await Promise.all(
    rawReviews.map(async (r) => {
      const u = await store.findUserById(r.userId);
      return {
        ...r,
        user: u ? { id: u.id, name: u.name, avatarUrl: u.avatarUrl } : { id: "unknown", name: "Visitor" },
      };
    })
  );

  const rating = await spotRating(spot.id);
  const enrichedSelf = await enrichSpot(spot, req.user?.id, origin);
  const recResult = await recommend({ userId: req.user?.id, lat: spot.lat, lng: spot.lng });

  res.json({
    spot: enrichedSelf,
    rating,
    reviews,
    nearby: nearbyEnriched,
    recommended: recResult.items.slice(0, 4),
  });
});

// Search Suggestion
api.get("/search/suggest", async (req, res) => {
  const q = String(req.query.q || "");
  const allSpots = await store.spots("approved");
  const spots = searchSpots(q, allSpots).slice(0, 6);
  const allCats = await store.categories();
  const cats = allCats.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  res.json({
    spots: spots.map((s) => ({ id: s.id, slug: s.slug, name: s.name, barangay: s.barangay })),
    categories: cats,
  });
});

// Map View
api.get("/map", optionalAuth, async (req: AuthedRequest, res) => {
  const origin = originFrom(req);
  const spots = await store.spots("approved");
  const enriched = await enrichSpots(spots, req.user?.id, origin);
  res.json({
    center: { lat: 6.3347, lng: 124.9669 },
    spots: enriched,
  });
});

// Nearby
api.get("/nearby", optionalAuth, async (req: AuthedRequest, res) => {
  const origin = originFrom(req);
  if (!origin) return res.status(400).json({ error: "Location is required. Allow location access or drop a pin." });
  const spots = await store.spots("approved");
  const enriched = await enrichSpots(spots, req.user?.id, origin);
  enriched.sort((a, b) => (a.distanceKm || 99) - (b.distanceKm || 99));
  res.json({ spots: enriched });
});

// Recommendations
api.get("/recommendations", optionalAuth, async (req: AuthedRequest, res) => {
  const origin = originFrom(req);
  const categoryIds = String(req.query.categories || "")
    .split(",")
    .filter(Boolean);
  const result = await recommend({ userId: req.user?.id, lat: origin?.lat, lng: origin?.lng, categoryIds });
  res.json(result);
});

// Weather API (Feature 4: Weather-aware Trip Planning)
api.get("/weather", async (_req, res) => {
  const forecast = await getTupiWeather();
  if (!forecast) {
    return res.status(503).json({
      error: "Weather service temporarily unavailable. Confirm local mountain weather before departure.",
      coordinates: { lat: 6.3347, lng: 124.9669 },
      location: "Tupi, South Cotabato",
    });
  }
  res.json(forecast);
});

// Feature 2: Real Road Routing Navigation via OSRM with Mountain Fallback
api.get("/routes/directions", optionalAuth, async (req: Request, res: Response) => {
  let fromLat = req.query.fromLat ? Number(req.query.fromLat) : TUPI_CENTER.lat;
  let fromLng = req.query.fromLng ? Number(req.query.fromLng) : TUPI_CENTER.lng;
  let toLat = req.query.toLat ? Number(req.query.toLat) : null;
  let toLng = req.query.toLng ? Number(req.query.toLng) : null;

  if (req.query.spotId) {
    const spot = await store.getSpot(String(req.query.spotId));
    if (spot) {
      toLat = spot.lat;
      toLng = spot.lng;
    }
  }

  if (toLat == null || toLng == null || isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
    return res.status(400).json({ error: "Valid origin (fromLat, fromLng) and destination (toLat, toLng or spotId) are required." });
  }

  if (!isWithinTupi(toLat, toLng)) {
    return res.status(400).json({ error: "Directions are exclusively for destinations within Tupi, South Cotabato." });
  }
  // Support GPS origins anywhere in the Philippines leading to Tupi
  if (!isWithinPhilippines(fromLat, fromLng)) {
    fromLat = TUPI_CENTER.lat;
    fromLng = TUPI_CENTER.lng;
  }

  const route = await fetchRoadRoute({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng });
  const mode = String(req.query.mode || "car").toLowerCase();
  let adjustedMins = route.durationMinutes;
  if (mode === "motorcycle") {
    adjustedMins = Math.max(4, Math.round(route.durationMinutes * 0.85));
  } else if (mode === "tricycle") {
    adjustedMins = Math.max(6, Math.round(route.durationMinutes * 1.3));
  }
  res.json({ ...route, durationMinutes: adjustedMins, mode });
});

// Feature 3: Nearby Tourist Spot Discovery
api.get("/spots/nearby", optionalAuth, async (req: Request, res: Response) => {
  const lat = req.query.lat ? Number(req.query.lat) : null;
  const lng = req.query.lng ? Number(req.query.lng) : null;
  const radiusKm = req.query.radiusKm ? Number(req.query.radiusKm) : 25;
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;

  const allSpots = await store.spots("approved");
  let filtered = allSpots;

  if (categoryId && categoryId !== "all") {
    const cats = await store.categories();
    const matched = cats.find((c) => c.id === categoryId || c.slug === categoryId);
    const targetCatId = matched ? matched.id : categoryId;
    filtered = filtered.filter((s) => s.categoryId === targetCatId);
  }

  if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
    const origin = { lat, lng };
    const enriched = await enrichSpots(filtered, (req as AuthedRequest).user?.id, origin);
    const nearby = enriched
      .filter((s) => s.distanceKm != null && s.distanceKm <= radiusKm)
      .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));

    return res.json({
      origin,
      radiusKm,
      count: nearby.length,
      spots: nearby,
    });
  }

  const enriched = await enrichSpots(filtered, (req as AuthedRequest).user?.id);
  res.json({
    origin: null,
    radiusKm,
    count: enriched.length,
    spots: enriched,
  });
});

// Multi-Stop Route Planning & Optimization (Feature 2)
api.post("/routes/plan", optionalAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      spotIds: z.array(z.string()).min(1),
      startLat: z.number().optional(),
      startLng: z.number().optional(),
      optimize: z.boolean().default(true),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Select at least one destination to plan a route." });
  }

  const origin = {
    lat: parsed.data.startLat ?? 6.3347,
    lng: parsed.data.startLng ?? 124.9669,
  };

  const spots: TouristSpot[] = [];
  for (const id of parsed.data.spotIds) {
    const s = await store.getSpot(id);
    if (s && s.status === "approved") spots.push(s);
  }

  if (!spots.length) {
    return res.status(404).json({ error: "None of the selected destinations were found." });
  }

  // Nearest-neighbor multi-stop ordering if optimize requested
  const ordered: TouristSpot[] = [];
  const remaining = [...spots];
  let curr = origin;

  if (parsed.data.optimize) {
    while (remaining.length > 0) {
      let nearestIdx = 0;
      let nearestDist = haversineKm(curr, remaining[0]);
      for (let i = 1; i < remaining.length; i++) {
        const d = haversineKm(curr, remaining[i]);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }
      const chosen = remaining.splice(nearestIdx, 1)[0];
      ordered.push(chosen);
      curr = chosen;
    }
  } else {
    ordered.push(...spots);
  }

  // Calculate leg segments and road estimates (1.28 factor for highland rural roads)
  const legs: { from: string; to: string; straightKm: number; roadKm: number; estMinutes: number }[] = [];
  let totalRoadKm = 0;
  let totalMinutes = 0;
  let legOrigin = origin;

  for (const stop of ordered) {
    const straight = haversineKm(legOrigin, stop);
    const road = Number((straight * 1.28).toFixed(1));
    const minutes = Math.max(8, Math.round((road / 30) * 60));
    legs.push({
      from: "lat" in legOrigin && !("name" in legOrigin) ? "Starting Point" : (legOrigin as any).name,
      to: stop.name,
      straightKm: Number(straight.toFixed(1)),
      roadKm: road,
      estMinutes: minutes,
    });
    totalRoadKm += road;
    totalMinutes += minutes;
    legOrigin = stop;
  }

  res.json({
    origin,
    orderedSpots: await enrichSpots(ordered, req.user?.id, origin),
    legs,
    summary: {
      totalStops: ordered.length,
      estimatedTotalKm: Number(totalRoadKm.toFixed(1)),
      estimatedDriveMinutes: totalMinutes,
      note: "Distances include rural highland terrain compensation (1.28x factor). Actual ride times vary with weather and tricycle availability.",
    },
  });
});

// Saved Routes CRUD (Feature 2)
api.get("/routes", requireAuth, async (req: AuthedRequest, res) => {
  const routes = await store.savedRoutesFor(req.user!.id);
  res.json({ routes });
});

api.post("/routes", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      name: z.string().min(2),
      stops: z.array(
        z.object({
          spotId: z.string(),
          name: z.string(),
          lat: z.number().refine((n) => isWithinTupi(n, 124.9669), "Latitude must be within Tupi, South Cotabato"),
      lng: z.number().refine((n) => isWithinTupi(6.3347, n), "Longitude must be within Tupi, South Cotabato"),
          order: z.number(),
        })
      ),
      totalDistanceKm: z.number().default(0),
      estimatedMinutes: z.number().default(0),
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Invalid route payload." });

  const route: SavedRoute = {
    id: `route-${randomUUID().slice(0, 8)}`,
    userId: req.user!.id,
    name: parsed.data.name,
    stops: parsed.data.stops,
    totalDistanceKm: parsed.data.totalDistanceKm,
    estimatedMinutes: parsed.data.estimatedMinutes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const saved = await store.saveRoute(route);
  res.status(201).json({ route: saved });
});

api.delete("/routes/:id", requireAuth, async (req: AuthedRequest, res) => {
  const ok = await store.deleteRoute(req.params.id, req.user!.id);
  if (!ok) return res.status(404).json({ error: "Route not found." });
  res.json({ ok: true });
});

// Tourist Safety & Practical Information (Feature 8)
api.get("/safety-info", (_req, res) => {
  res.json({
    emergencyContacts: [
      { service: "MDRRMO Tupi (Rescue & Disaster Office)", phone: "911 / (083) 228-1000", available: "24/7", location: "Municipal Hall Compound" },
      { service: "Philippine National Police (PNP Tupi)", phone: "(083) 228-1234 / 0998-598-6444", available: "24/7", location: "Poblacion, Tupi" },
      { service: "Bureau of Fire Protection (BFP Tupi)", phone: "(083) 228-1111", available: "24/7", location: "Poblacion, Tupi" },
      { service: "Municipal Health Office / Rural Health Unit", phone: "(083) 228-1357", available: "Mon-Fri 8:00 AM - 5:00 PM", location: "Barangay Poblacion" },
      { service: "Municipal Tourism Office", phone: "(083) 228-5678", available: "Mon-Fri 8:00 AM - 5:00 PM", location: "Tourism Information Center" },
    ],
    guidance: [
      {
        topic: "Highland & Mountain Farm Travel",
        notes: "Sitio Glandang (SG Farm) and Mt. Matutum foothill barangays reach cool highland temperatures. Afternoon rains can make farm slopes slippery. Always carry an umbrella or lightweight poncho.",
      },
      {
        topic: "Local Cash & Connectivity",
        notes: "Most roadside fruit stalls, tricycle operators, and highland farm entrances accept cash (Philippine Peso) only. ATMs are located in Tupi Poblacion along the national highway.",
      },
      {
        topic: "Responsible Agri-Tourism",
        notes: "Please respect private fruit plantations. Do not pick pineapples, berries, or flowers without express host permission or guided picking tours.",
      },
      {
        topic: "Tricycle Fare Transparency",
        notes: "Special tricycle rides from Poblacion to highland farms vary by distance and passenger count. Inquire politely and agree on the fare prior to departure.",
      },
    ],
  });
});

// Favorites
api.post("/favorites/:spotId", requireAuth, async (req: AuthedRequest, res) => {
  const spot = await store.getSpot(req.params.spotId);
  if (!spot) return res.status(404).json({ error: "Destination not found." });
  const result = await store.toggleFavorite(req.user!.id, spot.id);
  if (result.saved) {
    await store.addPoints(req.user!.id, 2, "Saved a destination");
  }
  res.json(result);
});

api.get("/favorites", requireAuth, async (req: AuthedRequest, res) => {
  const origin = originFrom(req);
  const userFavs = await store.favoritesFor(req.user!.id);
  const spots: TouristSpot[] = [];
  for (const f of userFavs) {
    const s = await store.getSpot(f.spotId);
    if (s) spots.push(s);
  }
  const enriched = await enrichSpots(spots, req.user!.id, origin);
  res.json({ spots: enriched });
});

// Reviews
api.post("/reviews", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      spotId: z.string(),
      rating: z.number().int().min(1).max(5),
      body: z.string().min(12),
      photos: z.array(z.string()).optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Write at least a short review (12+ characters) and a 1–5 rating." });
  }

  // Check if user already reviewed this spot to prevent duplicate point exploitation
  const existingReviews = await store.reviewsForSpot(parsed.data.spotId);
  const alreadyReviewed = existingReviews.some((r) => r.userId === req.user!.id);

  const review = await store.addReview({
    id: `rev-${randomUUID().slice(0, 8)}`,
    userId: req.user!.id,
    spotId: parsed.data.spotId,
    rating: parsed.data.rating,
    body: parsed.data.body,
    photos: parsed.data.photos || [],
    helpfulCount: 0,
    helpfulBy: [],
    status: "published",
    createdAt: new Date().toISOString(),
  });

  // Only award points on the FIRST review of a destination
  let awarded = false;
  if (!alreadyReviewed) {
    await store.addPoints(req.user!.id, 25, `First review for destination ${parsed.data.spotId}`);
    await store.notify(req.user!.id, "Points Earned! ⭐", "You earned 25 explorer points for writing your first review of this destination.", "reward");
    awarded = true;
  }

  await store.audit(req.user!.id, "review", { spotId: parsed.data.spotId, isUpdate: alreadyReviewed });
  res.status(alreadyReviewed ? 200 : 201).json({ review, pointsAwarded: awarded ? 25 : 0 });
});

api.post("/reviews/:id/helpful", requireAuth, async (req: AuthedRequest, res) => {
  const review = await store.getReview(req.params.id);
  if (!review) return res.status(404).json({ error: "Review not found." });
  if (review.helpfulBy.includes(req.user!.id)) return res.json({ review });

  review.helpfulBy.push(req.user!.id);
  review.helpfulCount += 1;
  const updated = await store.addReview(review);
  res.json({ review: updated });
});

api.post("/reviews/:id/reply", requireAuth, requireRole("owner", "admin"), async (req: AuthedRequest, res) => {
  const review = await store.getReview(req.params.id);
  if (!review) return res.status(404).json({ error: "Review not found." });
  review.ownerReply = String(req.body?.body || "").slice(0, 800);
  const updated = await store.addReview(review);
  res.json({ review: updated });
});

// Reports
api.post("/reports", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ targetType: z.string(), targetId: z.string(), reason: z.string().min(8) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please describe what is wrong." });

  const report = await store.addReport({
    userId: req.user!.id,
    ...parsed.data,
  });
  res.status(201).json({ report });
});

// Trips CRUD
api.get("/trips", requireAuth, async (req: AuthedRequest, res) => {
  const trips = await store.tripsFor(req.user!.id);
  const enrichedTrips = await Promise.all(
    trips.map(async (t) => {
      const spotList: TouristSpot[] = [];
      for (const id of t.spotIds) {
        const s = await store.getSpot(id);
        if (s) spotList.push(s);
      }
      return {
        ...t,
        spots: await enrichSpots(spotList, req.user!.id),
      };
    })
  );
  res.json({ trips: enrichedTrips });
});

api.post("/trips", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ name: z.string().min(2), notes: z.string().optional(), spotIds: z.array(z.string()).default([]) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Give this trip a name." });

  const trip = await store.saveTrip({
    id: `trip-${randomUUID().slice(0, 8)}`,
    userId: req.user!.id,
    name: parsed.data.name,
    notes: parsed.data.notes,
    spotIds: parsed.data.spotIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  res.status(201).json({ trip });
});

api.patch("/trips/:id", requireAuth, async (req: AuthedRequest, res) => {
  const trip = await store.getTrip(req.params.id);
  if (!trip || trip.userId !== req.user!.id) return res.status(404).json({ error: "Trip not found." });

  const parsed = z
    .object({ name: z.string().optional(), notes: z.string().optional(), spotIds: z.array(z.string()).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid trip update." });

  Object.assign(trip, parsed.data);
  const updated = await store.saveTrip(trip);
  res.json({ trip: updated });
});

api.post("/trips/:id/duplicate", requireAuth, async (req: AuthedRequest, res) => {
  const trip = await store.getTrip(req.params.id);
  if (!trip || trip.userId !== req.user!.id) return res.status(404).json({ error: "Trip not found." });

  const copy = await store.saveTrip({
    ...trip,
    id: `trip-${randomUUID().slice(0, 8)}`,
    name: `${trip.name} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  res.status(201).json({ trip: copy });
});

api.delete("/trips/:id", requireAuth, async (req: AuthedRequest, res) => {
  const ok = await store.deleteTrip(req.params.id, req.user!.id);
  if (!ok) return res.status(404).json({ error: "Trip not found." });
  res.json({ ok: true });
});

// Itinerary Generation (Feature 1)
api.post("/itinerary", optionalAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      hours: z.number().min(1).max(16).optional(),
      budget: z.number().min(0),
      interests: z.array(z.string()).default([]),
      travelers: z.number().int().min(1).max(12),
      startLat: z.number().optional(),
      startLng: z.number().optional(),
      transport: z.enum(["tricycle", "motorcycle", "car", "jeepney"]),
      intensity: z.enum(["easy", "moderate", "active"]),
      travelDate: z.string().optional(),
      mustVisitSpotIds: z.array(z.string()).optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Please complete the planner form." });

  try {
    const itinerary = await buildItinerary({ ...parsed.data, userId: req.user?.id });
    res.json({ itinerary });
  } catch (err) {
    console.error("Itinerary build error:", err);
    res.status(503).json({ error: "The planner is temporarily unavailable. Try again." });
  }
});

// Rewards & Verifiable Vouchers (Feature 5)
api.get("/rewards", optionalAuth, async (req: AuthedRequest, res) => {
  const user = req.user ? await store.findUserById(req.user.id) : null;
  const rewards = await store.rewards(req.user?.role === "admin");
  const history = user ? await store.pointsHistory(user.id) : [];
  const redemptions = user ? await store.redemptions(user.id) : [];
  const badges = user ? await store.badgesFor(user.id) : [];
  const vouchers = user ? await store.vouchersFor(user.id) : [];

  res.json({
    rewards,
    points: user?.points || 0,
    history,
    redemptions,
    badges,
    vouchers,
  });
});

api.post("/rewards/:id/redeem", requireAuth, async (req: AuthedRequest, res) => {
  const idempotencyKey = req.headers["x-idempotency-key"] ? String(req.headers["x-idempotency-key"]) : undefined;
  const result = await store.redeem(req.user!.id, req.params.id, idempotencyKey);
  if ("error" in result && result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

api.get("/vouchers", requireAuth, async (req: AuthedRequest, res) => {
  const vouchers = await store.vouchersFor(req.user!.id);
  res.json({ vouchers });
});

// Voucher Verification & Claim (Feature 5: For Hosts and Admins)
api.get("/vouchers/:code/verify", requireAuth, requireRole("owner", "admin"), async (req: AuthedRequest, res) => {
  const voucher = await store.getVoucherByCode(req.params.code);
  if (!voucher) return res.status(404).json({ error: "Voucher not found." });
  res.json({ voucher });
});

api.post("/vouchers/:code/claim", requireAuth, requireRole("owner", "admin"), async (req: AuthedRequest, res) => {
  const result = await store.verifyAndRedeemVoucher(req.params.code, req.user!.id);
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json(result);
});

// Check-in & Visits (Feature 5 & 8)
api.post("/visits", requireAuth, async (req: AuthedRequest, res) => {
  const spotId = String(req.body?.spotId || "");
  const spot = await store.getSpot(spotId);
  if (!spot) return res.status(404).json({ error: "Destination not found." });
  const result = await store.checkIn(req.user!.id, spotId);
  res.json(result);
});

// Notifications
api.get("/notifications", requireAuth, async (req: AuthedRequest, res) => {
  const notifications = await store.notifications(req.user!.id);
  res.json({ notifications });
});

api.post("/notifications/read", requireAuth, async (req: AuthedRequest, res) => {
  await store.markRead(req.user!.id, req.body?.id);
  res.json({ ok: true });
});

// User Profile
api.patch("/profile", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      name: z.string().min(2).optional(),
      phone: z.string().optional(),
      bio: z.string().optional(),
      interests: z.array(z.string()).optional(),
      budgetPreference: z.string().optional(),
      tripStyle: z.string().optional(),
      onboardingComplete: z.boolean().optional(),
      avatarUrl: z.string().optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Profile update was invalid." });

  // Security: tourist cannot upgrade role or award points to self
  const user = await store.updateUser(req.user!.id, parsed.data);
  res.json({ user: user ? store.publicUser(user) : null });
});

api.get("/profile/summary", requireAuth, async (req: AuthedRequest, res) => {
  const user = await store.findUserById(req.user!.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const favs = await store.favoritesFor(user.id);
  const visits = await store.visitsFor(user.id);
  const trips = await store.tripsFor(user.id);
  const badges = await store.badgesFor(user.id);
  const vouchers = await store.vouchersFor(user.id);

  const visitsWithSpot = await Promise.all(
    visits.map(async (v) => ({ ...v, spot: await store.getSpot(v.spotId) }))
  );

  res.json({
    user: store.publicUser(user),
    favorites: favs.length,
    visits: visitsWithSpot,
    trips,
    badges,
    vouchers: vouchers.length,
    points: user.points,
  });
});

// Chatbot
api.post("/chat", optionalAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      message: z.string().min(1).max(2000),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).default([]),
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Type a message to Tupi Guide." });

  try {
    const result = await chatTupi(parsed.data.history, parsed.data.message);
    res.json(result);
  } catch {
    res.status(503).json({ error: "Chat is unavailable right now." });
  }
});

// Host / Owner Workspace
api.post("/owner/apply", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ businessName: z.string().min(2), notes: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Business name and a short note are required." });

  const app = await store.addOwnerApp({
    userId: req.user!.id,
    businessName: parsed.data.businessName,
    notes: parsed.data.notes,
  });
  await store.notify(req.user!.id, "Application received", "Your host application is submitted.", "owner");
  res.status(201).json({ application: app });
});

api.post("/owner/spots", requireAuth, requireRole("owner", "admin"), async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      name: z.string().min(3),
      categoryId: z.string(),
      description: z.string().min(20),
      shortDescription: z.string().min(10),
      lat: z.number().refine((n) => isWithinTupi(n, 124.9669), "Latitude must be within Tupi, South Cotabato"),
      lng: z.number().refine((n) => isWithinTupi(6.3347, n), "Longitude must be within Tupi, South Cotabato"),
      address: z.string(),
      barangay: z.string(),
      amenities: z.array(z.string()).default([]),
      images: z.array(z.object({ url: z.string(), alt: z.string() })).default([]),
      safetyGuidance: z.array(z.string()).optional(),
      emergencyContact: z.string().optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Complete the destination form before submitting." });

  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + randomUUID().slice(0, 6);
  const ts = new Date().toISOString();

  const spot = await store.saveSpot({
    id: `sp-${randomUUID().slice(0, 8)}`,
    slug,
    ...parsed.data,
    featured: false,
    status: "pending",
    ownerId: req.user!.id,
    dataSource: "owner",
    popularityScore: 10,
    viewCount: 0,
    visitCount: 0,
    verificationStatus: "under_review",
    createdAt: ts,
    updatedAt: ts,
  });

  res.status(201).json({ spot });
});

api.get("/owner/dashboard", requireAuth, requireRole("owner", "admin"), async (req: AuthedRequest, res) => {
  const allSpots = await store.spots("all");
  const mine = allSpots.filter((s) => s.ownerId === req.user!.id);
  const allReviews = await store.allReviews();
  const reviews = allReviews.filter((r) => mine.some((s) => s.id === r.spotId));
  const ownerApps = await store.ownerApps();
  const verification = ownerApps.find((a) => a.userId === req.user!.id);

  const enrichedSpots = await enrichSpots(mine, req.user!.id);

  res.json({
    verification,
    spots: enrichedSpots,
    reviews,
    totals: {
      views: mine.reduce((a, s) => a + s.viewCount, 0),
      visits: mine.reduce((a, s) => a + s.visitCount, 0),
      rating:
        reviews.length === 0 ? 0 : Number((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(2)),
    },
  });
});

// Uploads
api.post("/uploads", requireAuth, upload.single("file"), (req: AuthedRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "Choose an image to upload." });
  res.json({ url: `/uploads/${path.basename(req.file.path)}`, originalName: req.file.originalname });
});

// Admin Overview & Analytics (Feature 9)
api.get("/admin/overview", requireAuth, requireRole("admin"), async (_req: AuthedRequest, res: Response) => {
  const analytics = await store.analytics();
  res.json(analytics);
});

// Admin CSV Export (Feature 9: Responsible Reporting)
api.get("/admin/export-csv", requireAuth, requireRole("admin"), async (_req: AuthedRequest, res: Response) => {
  const spots = await store.spots("all");
  const headers = "ID,Name,Barangay,Status,Views,Visits,EntranceFee,LastVerified\n";
  const rows = spots
    .map(
      (s) =>
        `"${s.id}","${s.name.replace(/"/g, '""')}","${s.barangay}","${s.status}",${s.viewCount},${s.visitCount},${s.estimatedEntranceFee || 0},"${s.lastVerifiedAt || ""}"`
    )
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="tupi-spots-report.csv"');
  res.send(headers + rows);
});

// Admin Spots Management
api.get("/admin/spots", requireAuth, requireRole("admin"), async (_req: AuthedRequest, res: Response) => {
  const spots = await store.spots("all");
  res.json({ spots });
});

const adminSpotSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  categoryId: z.string().min(1, "Category is required"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  shortDescription: z.string().min(10, "Short description must be at least 10 characters"),
  lat: z.number().refine((n) => n >= -90 && n <= 90, "Valid latitude required"),
  lng: z.number().refine((n) => n >= -180 && n <= 180, "Valid longitude required"),
  address: z.string().min(3, "Address is required"),
  barangay: z.string().min(2, "Barangay is required"),
  amenities: z.array(z.string()).default([]),
  operatingHours: z
    .object({
      days: z.string().default("Daily"),
      hours: z.string().default("8:00 AM - 5:00 PM"),
      reliability: z.enum(["verified", "owner", "estimated"]).default("verified"),
    })
    .optional(),
  contact: z.string().optional(),
  featured: z.boolean().default(false),
  status: z.enum(["approved", "pending", "under_review", "rejected", "draft"]).default("approved"),
  estimatedEntranceFee: z.number().optional(),
  safetyGuidance: z.array(z.string()).optional(),
  emergencyContact: z.string().optional(),
  images: z.array(z.object({ url: z.string(), alt: z.string() })).default([]),
});

api.post("/admin/spots", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  const parsed = adminSpotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid destination data." });
  }

  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + randomUUID().slice(0, 4);
  const ts = new Date().toISOString();
  const id = `sp-${randomUUID().slice(0, 8)}`;
  const data = parsed.data;

  const newSpot: TouristSpot = {
    id,
    slug,
    name: data.name,
    categoryId: data.categoryId,
    description: data.description,
    shortDescription: data.shortDescription,
    lat: data.lat,
    lng: data.lng,
    address: data.address,
    barangay: data.barangay,
    amenities: data.amenities,
    operatingHours: data.operatingHours,
    contact: data.contact,
    featured: data.featured,
    status: data.status,
    ownerId: undefined,
    dataSource: "curated",
    estimatedEntranceFee: data.estimatedEntranceFee,
    popularityScore: 50,
    viewCount: 0,
    visitCount: 0,
    images: data.images,
    verificationStatus: "verified",
    lastVerifiedAt: ts,
    verifiedBy: req.user!.id,
    safetyGuidance: data.safetyGuidance || [],
    emergencyContact: data.emergencyContact,
    createdAt: ts,
    updatedAt: ts,
  };

  const spot = await store.saveSpot(newSpot);
  await store.audit(req.user!.id, "admin-create-spot", { id: spot.id, name: spot.name });
  res.status(201).json({ spot });
});

api.put("/admin/spots/:id", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  const existing = await store.getSpot(req.params.id);
  if (!existing) return res.status(404).json({ error: "Destination not found." });

  const parsed = adminSpotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid destination data." });
  }

  const data = parsed.data;
  const spotToUpdate: TouristSpot = {
    ...existing,
    name: data.name,
    categoryId: data.categoryId,
    description: data.description,
    shortDescription: data.shortDescription,
    lat: data.lat,
    lng: data.lng,
    address: data.address,
    barangay: data.barangay,
    amenities: data.amenities,
    operatingHours: data.operatingHours ?? existing.operatingHours,
    contact: data.contact !== undefined ? data.contact : existing.contact,
    featured: data.featured,
    status: data.status,
    estimatedEntranceFee: data.estimatedEntranceFee !== undefined ? data.estimatedEntranceFee : existing.estimatedEntranceFee,
    safetyGuidance: data.safetyGuidance ?? existing.safetyGuidance,
    emergencyContact: data.emergencyContact !== undefined ? data.emergencyContact : existing.emergencyContact,
    images: data.images,
    updatedAt: new Date().toISOString(),
  };

  const updated = await store.saveSpot(spotToUpdate);
  await store.audit(req.user!.id, "admin-update-spot", { id: existing.id, name: updated.name });
  res.json({ spot: updated });
});

api.delete("/admin/spots/:id", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  const existing = await store.getSpot(req.params.id);
  if (!existing) return res.status(404).json({ error: "Destination not found." });

  const ok = await store.deleteSpot(existing.id);
  if (!ok) return res.status(500).json({ error: "Failed to delete destination." });

  await store.audit(req.user!.id, "admin-delete-spot", { id: existing.id, name: existing.name });
  res.json({ success: true, id: existing.id });
});

api.post("/admin/spots/:id/status", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  const spot = await store.getSpot(req.params.id);
  if (!spot) return res.status(404).json({ error: "Spot not found." });

  const status = String(req.body?.status || "");
  if (!["approved", "rejected", "under_review", "pending"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }

  spot.status = status as typeof spot.status;
  const saved = await store.saveSpot(spot);

  if (spot.ownerId) {
    await store.notify(spot.ownerId, "Destination update", `${spot.name} status is now ${status}.`, "destination");
  }
  await store.audit(req.user!.id, "spot-status", { id: spot.id, status });
  res.json({ spot: saved });
});

// Feature 3: Destination Freshness Verification Endpoint
api.post("/admin/spots/:id/verify", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  const status = (req.body?.status || "verified") as VerificationStatus;
  const updated = await store.updateSpotVerification(req.params.id, status, req.user!.id);
  if (!updated) return res.status(404).json({ error: "Spot not found." });
  await store.audit(req.user!.id, "spot-verify", { id: req.params.id, status });
  res.json({ spot: updated });
});

api.post("/admin/spots/:id/feature", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  const spot = await store.getSpot(req.params.id);
  if (!spot) return res.status(404).json({ error: "Spot not found." });
  spot.featured = Boolean(req.body?.featured);
  const saved = await store.saveSpot(spot);
  res.json({ spot: saved });
});

api.get("/admin/owners", requireAuth, requireRole("admin"), async (_req: AuthedRequest, res: Response) => {
  const applications = await store.ownerApps();
  const owners = await store.listUsers("owner");
  res.json({ applications, owners });
});

api.post("/admin/owners/:id/status", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  const app = await store.setOwnerApp(req.params.id, String(req.body?.status || ""));
  if (!app) return res.status(404).json({ error: "Application not found." });
  await store.audit(req.user!.id, "owner-status", { id: app.id, status: app.status });
  res.json({ application: app });
});

api.get("/admin/reviews", requireAuth, requireRole("admin"), async (_req: AuthedRequest, res: Response) => {
  const reviews = await store.allReviews();
  const reports = await store.reports();
  res.json({ reviews, reports });
});

api.post("/admin/reviews/:id/hide", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  const review = await store.hideReview(req.params.id);
  res.json({ review });
});

api.post("/admin/rewards", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  const parsed = z
    .object({
      id: z.string().optional(),
      name: z.string(),
      description: z.string(),
      pointsCost: z.number().int().positive(),
      stock: z.number().int(),
      active: z.boolean().default(true),
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Reward fields are incomplete." });

  const reward = await store.saveReward({
    id: parsed.data.id || `rw-${randomUUID().slice(0, 8)}`,
    name: parsed.data.name,
    description: parsed.data.description,
    pointsCost: parsed.data.pointsCost,
    stock: parsed.data.stock,
    active: parsed.data.active,
  });
  res.json({ reward });
});

api.get("/admin/users", requireAuth, requireRole("admin"), async (_req: AuthedRequest, res: Response) => {
  const all = await store.listUsers();
  res.json({ users: all.map((u) => store.publicUser(u)) });
});

api.post("/admin/categories", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  const parsed = z
    .object({ id: z.string().optional(), slug: z.string(), name: z.string(), description: z.string(), icon: z.string() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Category fields are incomplete." });
  const category = await store.upsertCategory(parsed.data);
  res.json({ category });
});
