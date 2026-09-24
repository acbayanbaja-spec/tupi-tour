import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { config } from "./config.js";
import { badgeSeed, categorySeed, newId, rewardSeed, spotSeed } from "./seedData.js";
import type {
  DatabaseShape,
  Notification,
  Review,
  Reward,
  Role,
  TouristSpot,
  Trip,
  User,
} from "./types.js";

const dataDir = path.join(process.cwd(), "data");
const dbFile = path.join(dataDir, "db.json");

function emptyDb(): DatabaseShape {
  return {
    users: [],
    categories: [],
    spots: [],
    favorites: [],
    reviews: [],
    trips: [],
    rewards: [],
    userRewards: [],
    points: [],
    badges: [],
    userBadges: [],
    notifications: [],
    visits: [],
    reports: [],
    ownerVerifications: [],
    auditLogs: [],
    refreshTokens: [],
    passwordResets: [],
    searchEvents: [],
  };
}

let memory = emptyDb();
let pg: Pool | null = null;

async function syncToPg() {
  if (!pg) return;
  try {
    await pg.query(
      `INSERT INTO app_state (key, data, updated_at) VALUES ('main', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET data = $1, updated_at = NOW()`,
      [JSON.stringify(memory)]
    );
  } catch (err) {
    console.error("Failed to sync to PostgreSQL app_state:", err);
  }
}

function persist() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(dbFile, JSON.stringify(memory, null, 2), "utf8");
  if (pg) {
    syncToPg().catch(() => {});
  }
}

function loadJson() {
  if (existsSync(dbFile)) {
    memory = { ...emptyDb(), ...JSON.parse(readFileSync(dbFile, "utf8")) };
  }
}

async function seedIfEmpty() {
  if (memory.users.length) return;
  const password = async (p: string) => bcrypt.hash(p, 12);
  const ts = new Date().toISOString();
  memory.categories = categorySeed();
  memory.spots = spotSeed();
  memory.rewards = rewardSeed();
  memory.badges = badgeSeed;
  memory.users = [
    {
      id: "user-admin",
      email: "admin@tupi.tour",
      passwordHash: await password("AdminTupi2026!"),
      name: "Tupi Tourism Admin",
      role: "admin",
      interests: [],
      onboardingComplete: true,
      emailVerified: true,
      points: 0,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: "user-owner",
      email: "owner@tupi.tour",
      passwordHash: await password("Owner123!"),
      name: "Kablon Farm Owner",
      role: "owner",
      interests: ["agri-tourism"],
      onboardingComplete: true,
      emailVerified: true,
      points: 40,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: "user-tourist",
      email: "tourist@tupi.tour",
      passwordHash: await password("Tourist123!"),
      name: "Ana Explorer",
      role: "tourist",
      interests: ["nature", "agri-tourism"],
      budgetPreference: "moderate",
      tripStyle: "half-day",
      onboardingComplete: true,
      emailVerified: true,
      points: 160,
      createdAt: ts,
      updatedAt: ts,
    },
  ];
  memory.spots[0].ownerId = "user-owner";
  memory.ownerVerifications.push({
    id: newId(),
    userId: "user-owner",
    businessName: "Glandang Highland Farm",
    notes: "Demo owner account for SG Farm area.",
    status: "approved",
    createdAt: ts,
    reviewedAt: ts,
  });
  persist();
}

export async function initDb() {
  if (config.databaseUrl) {
    pg = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    try {
      await pg.query("select 1");
      console.log("Connected to PostgreSQL database successfully.");
      await pg.query(`
        CREATE TABLE IF NOT EXISTS app_state (
          key text PRIMARY KEY,
          data jsonb NOT NULL,
          updated_at timestamptz DEFAULT NOW()
        );
      `);
      const res = await pg.query("SELECT data FROM app_state WHERE key = 'main'");
      if (res.rows.length && res.rows[0].data) {
        memory = { ...emptyDb(), ...res.rows[0].data };
        console.log("Restored application state from PostgreSQL.");
      } else {
        loadJson();
        await seedIfEmpty();
        await syncToPg();
        console.log("Initialized PostgreSQL app_state with seed data.");
      }
    } catch (err) {
      console.error("Postgres connection failed, falling back to local JSON store:", err);
      pg = null;
      loadJson();
      await seedIfEmpty();
    }
  } else {
    loadJson();
    await seedIfEmpty();
  }
}

export const store = {
  isUsingPostgres() {
    return pg !== null;
  },
  audit(actorId: string | undefined, action: string, meta: Record<string, unknown> = {}) {
    memory.auditLogs.unshift({ id: newId(), actorId, action, meta, createdAt: new Date().toISOString() });
    persist();
  },
  publicUser(u: User) {
    const { passwordHash, ...rest } = u;
    return rest;
  },
  findUserByEmail(email: string) {
    return memory.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  },
  findUserById(id: string) {
    return memory.users.find((u) => u.id === id);
  },
  createUser(input: { email: string; passwordHash: string; name: string; role: Role }) {
    const ts = new Date().toISOString();
    const user: User = {
      id: newId(),
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      name: input.name,
      role: input.role,
      interests: [],
      onboardingComplete: false,
      emailVerified: true,
      points: 0,
      createdAt: ts,
      updatedAt: ts,
    };
    memory.users.push(user);
    persist();
    return user;
  },
  updateUser(id: string, patch: Partial<User>) {
    const user = this.findUserById(id);
    if (!user) return null;
    Object.assign(user, patch, { updatedAt: new Date().toISOString() });
    persist();
    return user;
  },
  listUsers(role?: Role) {
    return memory.users.filter((u) => (role ? u.role === role : true));
  },
  categories() {
    return memory.categories;
  },
  upsertCategory(cat: { id?: string; slug: string; name: string; description: string; icon: string }) {
    if (cat.id) {
      const existing = memory.categories.find((c) => c.id === cat.id);
      if (existing) {
        Object.assign(existing, cat);
        persist();
        return existing;
      }
    }
    const created = { id: cat.id || newId(), slug: cat.slug, name: cat.name, description: cat.description, icon: cat.icon };
    memory.categories.push(created);
    persist();
    return created;
  },
  spots(status: TouristSpot["status"] | "all" = "approved") {
    return memory.spots.filter((s) => (status === "all" ? true : s.status === status));
  },
  getSpot(idOrSlug: string) {
    return memory.spots.find((s) => s.id === idOrSlug || s.slug === idOrSlug);
  },
  saveSpot(spot: TouristSpot) {
    const idx = memory.spots.findIndex((s) => s.id === spot.id);
    if (idx >= 0) memory.spots[idx] = spot;
    else memory.spots.push(spot);
    persist();
    return spot;
  },
  bumpViews(id: string) {
    const spot = this.getSpot(id);
    if (!spot) return;
    spot.viewCount += 1;
    persist();
  },
  logSearch(query: string, userId?: string) {
    memory.searchEvents.unshift({ id: newId(), query, userId, createdAt: new Date().toISOString() });
    memory.searchEvents = memory.searchEvents.slice(0, 2000);
    persist();
  },
  toggleFavorite(userId: string, spotId: string) {
    const existing = memory.favorites.find((f) => f.userId === userId && f.spotId === spotId);
    if (existing) {
      memory.favorites = memory.favorites.filter((f) => f !== existing);
      persist();
      return { saved: false };
    }
    memory.favorites.push({ userId, spotId, createdAt: new Date().toISOString() });
    persist();
    return { saved: true };
  },
  favoritesFor(userId: string) {
    return memory.favorites.filter((f) => f.userId === userId);
  },
  isFavorite(userId: string, spotId: string) {
    return memory.favorites.some((f) => f.userId === userId && f.spotId === spotId);
  },
  reviewsForSpot(spotId: string) {
    return memory.reviews.filter((r) => r.spotId === spotId && r.status === "published");
  },
  allReviews() {
    return memory.reviews;
  },
  getReview(id: string) {
    return memory.reviews.find((r) => r.id === id);
  },
  addReview(review: Review) {
    memory.reviews = memory.reviews.filter((r) => !(r.userId === review.userId && r.spotId === review.spotId));
    memory.reviews.unshift(review);
    persist();
    return review;
  },
  hideReview(id: string) {
    const r = this.getReview(id);
    if (r) {
      r.status = "hidden";
      persist();
    }
    return r;
  },
  tripsFor(userId: string) {
    return memory.trips.filter((t) => t.userId === userId);
  },
  getTrip(id: string) {
    return memory.trips.find((t) => t.id === id);
  },
  saveTrip(trip: Trip) {
    const idx = memory.trips.findIndex((t) => t.id === trip.id);
    if (idx >= 0) memory.trips[idx] = trip;
    else memory.trips.push(trip);
    persist();
    return trip;
  },
  deleteTrip(id: string, userId: string) {
    const trip = this.getTrip(id);
    if (!trip || trip.userId !== userId) return false;
    memory.trips = memory.trips.filter((t) => t.id !== id);
    persist();
    return true;
  },
  rewards() {
    return memory.rewards;
  },
  saveReward(reward: Reward) {
    const idx = memory.rewards.findIndex((r) => r.id === reward.id);
    if (idx >= 0) memory.rewards[idx] = reward;
    else memory.rewards.push(reward);
    persist();
    return reward;
  },
  addPoints(userId: string, amount: number, reason: string) {
    const user = this.findUserById(userId);
    if (!user) return null;
    user.points = Math.max(0, user.points + amount);
    memory.points.unshift({ id: newId(), userId, amount, reason, createdAt: new Date().toISOString() });
    this.maybeBadges(user);
    persist();
    return user;
  },
  redeem(userId: string, rewardId: string) {
    const user = this.findUserById(userId);
    const reward = memory.rewards.find((r) => r.id === rewardId && r.active);
    if (!user || !reward) return { error: "Reward not found" };
    if (reward.stock <= 0) return { error: "Out of stock" };
    if (user.points < reward.pointsCost) return { error: "Not enough points" };
    user.points -= reward.pointsCost;
    reward.stock -= 1;
    memory.points.unshift({ id: newId(), userId, amount: -reward.pointsCost, reason: `Redeemed ${reward.name}`, createdAt: new Date().toISOString() });
    const redemption = { id: newId(), userId, rewardId, createdAt: new Date().toISOString() };
    memory.userRewards.unshift(redemption);
    this.notify(userId, "Reward redeemed", `You redeemed ${reward.name}.`, "reward");
    persist();
    return { redemption, user: this.publicUser(user), reward };
  },
  redemptions(userId?: string) {
    return memory.userRewards.filter((r) => (userId ? r.userId === userId : true));
  },
  pointsHistory(userId: string) {
    return memory.points.filter((p) => p.userId === userId);
  },
  notify(userId: string, title: string, body: string, type: string) {
    const n: Notification = { id: newId(), userId, title, body, type, read: false, createdAt: new Date().toISOString() };
    memory.notifications.unshift(n);
    persist();
    return n;
  },
  notifications(userId: string) {
    return memory.notifications.filter((n) => n.userId === userId);
  },
  markRead(userId: string, id?: string) {
    memory.notifications.forEach((n) => {
      if (n.userId === userId && (!id || n.id === id)) n.read = true;
    });
    persist();
  },
  visitsFor(userId: string) {
    return memory.visits.filter((v) => v.userId === userId);
  },
  checkIn(userId: string, spotId: string) {
    const existingToday = memory.visits.find((v) => v.userId === userId && v.spotId === spotId && v.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10));
    if (existingToday) return { visit: existingToday, awarded: false };
    const visit = { id: newId(), userId, spotId, createdAt: new Date().toISOString() };
    memory.visits.unshift(visit);
    const spot = this.getSpot(spotId);
    if (spot) spot.visitCount += 1;
    this.addPoints(userId, 25, `Visited ${spot?.name || "a destination"}`);
    this.notify(userId, "Visit recorded", `Nice work exploring ${spot?.name || "Tupi"}. +25 points`, "visit");
    persist();
    return { visit, awarded: true };
  },
  maybeBadges(user: User) {
    const award = (slug: string) => {
      const badge = memory.badges.find((b) => b.slug === slug);
      if (!badge) return;
      if (memory.userBadges.some((b) => b.userId === user.id && b.badgeId === badge.id)) return;
      memory.userBadges.push({ userId: user.id, badgeId: badge.id, earnedAt: new Date().toISOString() });
      this.notify(user.id, "Badge unlocked", badge.name, "badge");
    };
    const visits = this.visitsFor(user.id).length;
    if (visits >= 1) award("first-adventure");
    if (visits >= 3) award("tupi-explorer");
    if (this.favoritesFor(user.id).some((f) => this.getSpot(f.spotId)?.categoryId === "cat-nature")) award("nature-seeker");
    if (memory.reviews.some((r) => r.userId === user.id)) award("local-discoverer");
    if (user.points >= 300) award("tupi-champion");
  },
  badgesFor(userId: string) {
    return memory.userBadges
      .filter((b) => b.userId === userId)
      .map((b) => ({ ...b, badge: memory.badges.find((x) => x.id === b.badgeId) }));
  },
  addReport(report: DatabaseShape["reports"][number]) {
    memory.reports.unshift(report);
    persist();
    return report;
  },
  reports() {
    return memory.reports;
  },
  ownerApps() {
    return memory.ownerVerifications;
  },
  addOwnerApp(app: DatabaseShape["ownerVerifications"][number]) {
    memory.ownerVerifications.unshift(app);
    persist();
    return app;
  },
  setOwnerApp(id: string, status: string) {
    const app = memory.ownerVerifications.find((a) => a.id === id);
    if (!app) return null;
    app.status = status;
    app.reviewedAt = new Date().toISOString();
    const user = this.findUserById(app.userId);
    if (user && status === "approved") user.role = "owner";
    this.notify(app.userId, "Owner application update", `Status: ${status}`, "owner");
    persist();
    return app;
  },
  saveRefresh(userId: string, tokenHash: string, expiresAt: string) {
    memory.refreshTokens.push({ id: newId(), userId, tokenHash, expiresAt, revoked: false });
    persist();
  },
  findRefresh(tokenHash: string) {
    return memory.refreshTokens.find((t) => t.tokenHash === tokenHash && !t.revoked);
  },
  revokeRefresh(tokenHash: string) {
    const t = this.findRefresh(tokenHash);
    if (t) t.revoked = true;
    persist();
  },
  saveReset(userId: string, tokenHash: string, expiresAt: string) {
    memory.passwordResets.push({ id: newId(), userId, tokenHash, expiresAt, used: false });
    persist();
  },
  consumeReset(tokenHash: string) {
    const row = memory.passwordResets.find((r) => r.tokenHash === tokenHash && !r.used && new Date(r.expiresAt) > new Date());
    if (!row) return null;
    row.used = true;
    persist();
    return row;
  },
  analytics() {
    const approved = memory.spots.filter((s) => s.status === "approved");
    const byCat = memory.categories.map((c) => ({
      name: c.name,
      spots: approved.filter((s) => s.categoryId === c.id).length,
      views: approved.filter((s) => s.categoryId === c.id).reduce((a, s) => a + s.viewCount, 0),
    }));
    const searchCounts = new Map<string, number>();
    memory.searchEvents.forEach((e) => searchCounts.set(e.query, (searchCounts.get(e.query) || 0) + 1));
    return {
      totals: {
        spots: approved.length,
        pendingSpots: memory.spots.filter((s) => s.status === "pending" || s.status === "under_review").length,
        tourists: memory.users.filter((u) => u.role === "tourist").length,
        owners: memory.users.filter((u) => u.role === "owner").length,
        visits: memory.visits.length,
        reviews: memory.reviews.filter((r) => r.status === "published").length,
        redemptions: memory.userRewards.length,
      },
      popular: [...approved].sort((a, b) => b.viewCount - a.viewCount).slice(0, 8),
      mostVisited: [...approved].sort((a, b) => b.visitCount - a.visitCount).slice(0, 8),
      mostFavorited: approved
        .map((s) => ({ ...s, favs: memory.favorites.filter((f) => f.spotId === s.id).length }))
        .sort((a, b) => b.favs - a.favs)
        .slice(0, 8),
      mostSearched: [...searchCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([query, count]) => ({ query, count })),
      categories: byCat,
      ratingTrends: approved.map((s) => {
        const revs = memory.reviews.filter((r) => r.spotId === s.id && r.status === "published");
        const avg = revs.length ? revs.reduce((a, r) => a + r.rating, 0) / revs.length : 0;
        return { name: s.name, rating: Number(avg.toFixed(2)), reviews: revs.length };
      }),
      recentActivity: memory.auditLogs.slice(0, 20),
    };
  },
  snapshot() {
    return memory;
  },
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function spotRating(spotId: string) {
  const reviews = memory.reviews.filter((r) => r.spotId === spotId && r.status === "published");
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const dist = [1, 2, 3, 4, 5].map((n) => reviews.filter((r) => r.rating === n).length);
  return { average: Number(avg.toFixed(2)), count: reviews.length, distribution: dist };
}
