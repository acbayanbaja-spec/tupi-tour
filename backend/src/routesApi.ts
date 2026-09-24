import { randomUUID } from "crypto";
import { type Request, type Response, Router } from "express";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { optionalAuth, requireAuth, requireRole, type AuthedRequest } from "./auth.js";
import { chatTupi } from "./chatbot.js";
import { config } from "./config.js";
import { enrichSpot, haversineKm, recommend, searchSpots } from "./geo.js";
import { buildItinerary } from "./itinerary.js";
import { newId } from "./seedData.js";
import { spotRating, store } from "./store.js";

export const api = Router();
const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: 4 * 1024 * 1024 },
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

api.get("/health", (_req, res) => res.json({ ok: true, service: "tupi-tour-api" }));

api.get("/categories", (_req, res) => res.json({ categories: store.categories() }));

api.get("/spots", optionalAuth, (req: AuthedRequest, res) => {
  const q = String(req.query.q || "");
  const category = String(req.query.category || "");
  const sort = String(req.query.sort || "popular");
  const featured = String(req.query.featured || "");
  const origin = originFrom(req);
  let spots = store.spots("approved");
  if (category) spots = spots.filter((s) => s.categoryId === category || store.categories().find((c) => c.id === s.categoryId)?.slug === category);
  if (featured === "true") spots = spots.filter((s) => s.featured);
  if (q) {
    store.logSearch(q, req.user?.id);
    spots = searchSpots(q, spots);
  }
  const enriched = spots.map((s) => enrichSpot(s, req.user?.id, origin));
  enriched.sort((a, b) => {
    if (sort === "rating") return b.rating.average - a.rating.average;
    if (sort === "distance" && origin) return (a.distanceKm || 99) - (b.distanceKm || 99);
    if (sort === "name") return a.name.localeCompare(b.name);
    return b.popularityScore - a.popularityScore;
  });
  res.json({ spots: enriched });
});

api.get("/spots/:id", optionalAuth, (req: AuthedRequest, res) => {
  const spot = store.getSpot(req.params.id);
  if (!spot || spot.status !== "approved") return res.status(404).json({ error: "That destination is not available." });
  store.bumpViews(spot.id);
  const origin = originFrom(req);
  const nearby = store
    .spots("approved")
    .filter((s) => s.id !== spot.id)
    .map((s) => ({ s, km: haversineKm(spot, s) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 5)
    .map((x) => enrichSpot(x.s, req.user?.id, origin || spot));
  const reviews = store.reviewsForSpot(spot.id).map((r) => ({
    ...r,
    user: (() => {
      const u = store.findUserById(r.userId);
      return u ? { id: u.id, name: u.name, avatarUrl: u.avatarUrl } : { id: "unknown", name: "Visitor" };
    })(),
  }));
  res.json({
    spot: enrichSpot(spot, req.user?.id, origin),
    rating: spotRating(spot.id),
    reviews,
    nearby,
    recommended: recommend({ userId: req.user?.id, lat: spot.lat, lng: spot.lng }).items.slice(0, 4),
  });
});

api.get("/search/suggest", (req, res) => {
  const q = String(req.query.q || "");
  const spots = searchSpots(q, store.spots("approved")).slice(0, 6);
  const cats = store.categories().filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  res.json({ spots: spots.map((s) => ({ id: s.id, slug: s.slug, name: s.name, barangay: s.barangay })), categories: cats });
});

api.get("/map", optionalAuth, (req: AuthedRequest, res) => {
  const origin = originFrom(req);
  res.json({
    center: { lat: 6.3347, lng: 124.9669 },
    spots: store.spots("approved").map((s) => enrichSpot(s, req.user?.id, origin)),
  });
});

api.get("/nearby", optionalAuth, (req: AuthedRequest, res) => {
  const origin = originFrom(req);
  if (!origin) return res.status(400).json({ error: "Location is required. Allow location access or drop a pin." });
  const spots = store
    .spots("approved")
    .map((s) => enrichSpot(s, req.user?.id, origin))
    .sort((a, b) => (a.distanceKm || 99) - (b.distanceKm || 99));
  res.json({ spots });
});

api.get("/recommendations", optionalAuth, (req: AuthedRequest, res) => {
  const origin = originFrom(req);
  const categoryIds = String(req.query.categories || "")
    .split(",")
    .filter(Boolean);
  res.json(recommend({ userId: req.user?.id, lat: origin?.lat, lng: origin?.lng, categoryIds }));
});

api.post("/favorites/:spotId", requireAuth, (req: AuthedRequest, res) => {
  const spot = store.getSpot(req.params.spotId);
  if (!spot) return res.status(404).json({ error: "Destination not found." });
  const result = store.toggleFavorite(req.user!.id, spot.id);
  if (result.saved) store.addPoints(req.user!.id, 2, "Saved a destination");
  res.json(result);
});

api.get("/favorites", requireAuth, (req: AuthedRequest, res) => {
  const origin = originFrom(req);
  const spots = store.favoritesFor(req.user!.id).map((f) => store.getSpot(f.spotId)).filter(Boolean);
  res.json({ spots: spots.map((s) => enrichSpot(s!, req.user!.id, origin)) });
});

api.post("/reviews", requireAuth, (req: AuthedRequest, res) => {
  const parsed = z
    .object({ spotId: z.string(), rating: z.number().int().min(1).max(5), body: z.string().min(12), photos: z.array(z.string()).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Write at least a short review and a 1–5 rating." });
  const review = store.addReview({
    id: newId(),
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
  store.addPoints(req.user!.id, 15, "Published a review");
  store.audit(req.user!.id, "review", { spotId: parsed.data.spotId });
  res.status(201).json({ review });
});

api.post("/reviews/:id/helpful", requireAuth, (req: AuthedRequest, res) => {
  const review = store.getReview(req.params.id);
  if (!review) return res.status(404).json({ error: "Review not found." });
  if (review.helpfulBy.includes(req.user!.id)) return res.json({ review });
  review.helpfulBy.push(req.user!.id);
  review.helpfulCount += 1;
  store.addReview(review);
  res.json({ review });
});

api.post("/reviews/:id/reply", requireAuth, requireRole("owner", "admin"), (req: AuthedRequest, res) => {
  const review = store.getReview(req.params.id);
  if (!review) return res.status(404).json({ error: "Review not found." });
  review.ownerReply = String(req.body?.body || "").slice(0, 800);
  store.addReview(review);
  res.json({ review });
});

api.post("/reports", requireAuth, (req: AuthedRequest, res) => {
  const parsed = z.object({ targetType: z.string(), targetId: z.string(), reason: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please describe what is wrong." });
  const report = store.addReport({ id: newId(), userId: req.user!.id, ...parsed.data, status: "open", createdAt: new Date().toISOString() });
  res.status(201).json({ report });
});

api.get("/trips", requireAuth, (req: AuthedRequest, res) => {
  res.json({
    trips: store.tripsFor(req.user!.id).map((t) => ({
      ...t,
      spots: t.spotIds.map((id) => store.getSpot(id)).filter(Boolean).map((s) => enrichSpot(s!, req.user!.id)),
    })),
  });
});

api.post("/trips", requireAuth, (req: AuthedRequest, res) => {
  const parsed = z.object({ name: z.string().min(2), notes: z.string().optional(), spotIds: z.array(z.string()).default([]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Give this trip a name." });
  const trip = store.saveTrip({
    id: newId(),
    userId: req.user!.id,
    name: parsed.data.name,
    notes: parsed.data.notes,
    spotIds: parsed.data.spotIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  res.status(201).json({ trip });
});

api.patch("/trips/:id", requireAuth, (req: AuthedRequest, res) => {
  const trip = store.getTrip(req.params.id);
  if (!trip || trip.userId !== req.user!.id) return res.status(404).json({ error: "Trip not found." });
  const parsed = z.object({ name: z.string().optional(), notes: z.string().optional(), spotIds: z.array(z.string()).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid trip update." });
  Object.assign(trip, parsed.data, { updatedAt: new Date().toISOString() });
  store.saveTrip(trip);
  res.json({ trip });
});

api.post("/trips/:id/duplicate", requireAuth, (req: AuthedRequest, res) => {
  const trip = store.getTrip(req.params.id);
  if (!trip || trip.userId !== req.user!.id) return res.status(404).json({ error: "Trip not found." });
  const copy = store.saveTrip({
    ...trip,
    id: newId(),
    name: `${trip.name} (copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  res.status(201).json({ trip: copy });
});

api.delete("/trips/:id", requireAuth, (req: AuthedRequest, res) => {
  const ok = store.deleteTrip(req.params.id, req.user!.id);
  if (!ok) return res.status(404).json({ error: "Trip not found." });
  res.json({ ok: true });
});

api.post("/itinerary", optionalAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      hours: z.number().min(2).max(14),
      budget: z.number().min(0),
      interests: z.array(z.string()).default([]),
      travelers: z.number().int().min(1).max(12),
      startLat: z.number().optional(),
      startLng: z.number().optional(),
      transport: z.enum(["tricycle", "motorcycle", "car", "jeepney"]),
      intensity: z.enum(["easy", "moderate", "active"]),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please complete the planner form." });
  try {
    const itinerary = await buildItinerary({ ...parsed.data, userId: req.user?.id });
    res.json({ itinerary });
  } catch {
    res.status(503).json({ error: "The planner is temporarily unavailable. Try again." });
  }
});

api.get("/rewards", optionalAuth, (req: AuthedRequest, res) => {
  const user = req.user ? store.findUserById(req.user.id) : null;
  res.json({
    rewards: store.rewards().filter((r) => r.active || req.user?.role === "admin"),
    points: user?.points || 0,
    history: user ? store.pointsHistory(user.id) : [],
    redemptions: user ? store.redemptions(user.id) : [],
    badges: user ? store.badgesFor(user.id) : [],
  });
});

api.post("/rewards/:id/redeem", requireAuth, (req: AuthedRequest, res) => {
  const result = store.redeem(req.user!.id, req.params.id);
  if ("error" in result && result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

api.post("/visits", requireAuth, (req: AuthedRequest, res) => {
  const spotId = String(req.body?.spotId || "");
  if (!store.getSpot(spotId)) return res.status(404).json({ error: "Destination not found." });
  res.json(store.checkIn(req.user!.id, spotId));
});

api.get("/notifications", requireAuth, (req: AuthedRequest, res) => {
  res.json({ notifications: store.notifications(req.user!.id) });
});

api.post("/notifications/read", requireAuth, (req: AuthedRequest, res) => {
  store.markRead(req.user!.id, req.body?.id);
  res.json({ ok: true });
});

api.patch("/profile", requireAuth, (req: AuthedRequest, res) => {
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
  const user = store.updateUser(req.user!.id, parsed.data);
  res.json({ user: user ? store.publicUser(user) : null });
});

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

api.post("/owner/apply", requireAuth, (req: AuthedRequest, res) => {
  const parsed = z.object({ businessName: z.string().min(2), notes: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Business name and a short note are required." });
  const app = store.addOwnerApp({
    id: newId(),
    userId: req.user!.id,
    businessName: parsed.data.businessName,
    notes: parsed.data.notes,
    status: "submitted",
    createdAt: new Date().toISOString(),
  });
  store.notify(req.user!.id, "Application received", "Your owner application is submitted.", "owner");
  res.status(201).json({ application: app });
});

api.post("/owner/spots", requireAuth, requireRole("owner", "admin"), (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      name: z.string().min(3),
      categoryId: z.string(),
      description: z.string().min(20),
      shortDescription: z.string().min(10),
      lat: z.number(),
      lng: z.number(),
      address: z.string(),
      barangay: z.string(),
      amenities: z.array(z.string()).default([]),
      images: z.array(z.object({ url: z.string(), alt: z.string() })).default([]),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Complete the destination form before submitting." });
  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + randomUUID().slice(0, 6);
  const ts = new Date().toISOString();
  const spot = store.saveSpot({
    id: newId(),
    slug,
    ...parsed.data,
    featured: false,
    status: "pending",
    ownerId: req.user!.id,
    dataSource: "owner",
    popularityScore: 10,
    viewCount: 0,
    visitCount: 0,
    createdAt: ts,
    updatedAt: ts,
  });
  res.status(201).json({ spot });
});

api.get("/owner/dashboard", requireAuth, requireRole("owner", "admin"), (req: AuthedRequest, res) => {
  const mine = store.snapshot().spots.filter((s) => s.ownerId === req.user!.id);
  const reviews = store.snapshot().reviews.filter((r) => mine.some((s) => s.id === r.spotId));
  const verification = store.ownerApps().find((a) => a.userId === req.user!.id);
  res.json({
    verification,
    spots: mine.map((s) => enrichSpot(s, req.user!.id)),
    reviews,
    totals: {
      views: mine.reduce((a, s) => a + s.viewCount, 0),
      visits: mine.reduce((a, s) => a + s.visitCount, 0),
      rating:
        reviews.length === 0 ? 0 : Number((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(2)),
    },
  });
});

api.post("/uploads", requireAuth, upload.single("file"), (req: AuthedRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "Choose an image to upload." });
  res.json({ url: `/uploads/${path.basename(req.file.path)}`, originalName: req.file.originalname });
});

api.get("/admin/overview", requireAuth, requireRole("admin"), (_req: AuthedRequest, res: Response) => {
  res.json(store.analytics());
});

api.get("/admin/spots", requireAuth, requireRole("admin"), (_req: AuthedRequest, res: Response) => {
  res.json({ spots: store.spots("all") });
});

api.post("/admin/spots/:id/status", requireAuth, requireRole("admin"), (req: AuthedRequest, res: Response) => {
  const spot = store.getSpot(req.params.id);
  if (!spot) return res.status(404).json({ error: "Spot not found." });
  const status = String(req.body?.status || "");
  if (!["approved", "rejected", "under_review", "pending"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  spot.status = status as typeof spot.status;
  store.saveSpot(spot);
  if (spot.ownerId) store.notify(spot.ownerId, "Destination update", `${spot.name} is now ${status}.`, "destination");
  store.audit(req.user!.id, "spot-status", { id: spot.id, status });
  res.json({ spot });
});

api.post("/admin/spots/:id/feature", requireAuth, requireRole("admin"), (req: AuthedRequest, res: Response) => {
  const spot = store.getSpot(req.params.id);
  if (!spot) return res.status(404).json({ error: "Spot not found." });
  spot.featured = Boolean(req.body?.featured);
  store.saveSpot(spot);
  res.json({ spot });
});

api.get("/admin/owners", requireAuth, requireRole("admin"), (_req: AuthedRequest, res: Response) => {
  res.json({ applications: store.ownerApps(), owners: store.listUsers("owner") });
});

api.post("/admin/owners/:id/status", requireAuth, requireRole("admin"), (req: AuthedRequest, res: Response) => {
  const app = store.setOwnerApp(req.params.id, String(req.body?.status || ""));
  if (!app) return res.status(404).json({ error: "Application not found." });
  store.audit(req.user!.id, "owner-status", { id: app.id, status: app.status });
  res.json({ application: app });
});

api.get("/admin/reviews", requireAuth, requireRole("admin"), (_req: AuthedRequest, res: Response) => {
  res.json({ reviews: store.allReviews(), reports: store.reports() });
});

api.post("/admin/reviews/:id/hide", requireAuth, requireRole("admin"), (req: AuthedRequest, res: Response) => {
  res.json({ review: store.hideReview(req.params.id) });
});

api.post("/admin/rewards", requireAuth, requireRole("admin"), (req: AuthedRequest, res: Response) => {
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
  const reward = store.saveReward({
    id: parsed.data.id || newId(),
    name: parsed.data.name,
    description: parsed.data.description,
    pointsCost: parsed.data.pointsCost,
    stock: parsed.data.stock,
    active: parsed.data.active,
  });
  res.json({ reward });
});

api.get("/admin/users", requireAuth, requireRole("admin"), (_req: AuthedRequest, res: Response) => {
  res.json({ users: store.listUsers().map((u) => store.publicUser(u)) });
});

api.post("/admin/categories", requireAuth, requireRole("admin"), (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ id: z.string().optional(), slug: z.string(), name: z.string(), description: z.string(), icon: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Category fields are incomplete." });
  res.json({ category: store.upsertCategory(parsed.data) });
});

api.get("/profile/summary", requireAuth, (req: AuthedRequest, res: Response) => {
  const user = store.findUserById(req.user!.id)!;
  res.json({
    user: store.publicUser(user),
    favorites: store.favoritesFor(user.id).length,
    visits: store.visitsFor(user.id).map((v) => ({ ...v, spot: store.getSpot(v.spotId) })),
    trips: store.tripsFor(user.id),
    reviews: store.snapshot().reviews.filter((r) => r.userId === user.id),
    badges: store.badgesFor(user.id),
    points: user.points,
  });
});
