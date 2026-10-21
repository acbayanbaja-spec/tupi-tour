import { createHash, randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { badgeSeed, categorySeed, rewardSeed, spotSeed } from "../seedData.js";
import type {
  Category,
  DatabaseShape,
  Notification,
  Review,
  Reward,
  Role,
  SavedRoute,
  SpotStatus,
  TouristSpot,
  Trip,
  User,
  VerificationStatus,
  Voucher,
} from "../types.js";

const dataDir = path.join(process.cwd(), "data");
const dbFile = path.join(dataDir, "db.json");

function newId() {
  return "id-" + randomBytes(8).toString("hex");
}

function emptyDb(): DatabaseShape {
  return {
    users: [],
    categories: [],
    spots: [],
    favorites: [],
    reviews: [],
    trips: [],
    savedRoutes: [],
    rewards: [],
    vouchers: [],
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

let memory: DatabaseShape = emptyDb();

function persist() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(dbFile, JSON.stringify(memory, null, 2), "utf8");
}

function loadJson() {
  if (existsSync(dbFile)) {
    try {
      memory = { ...emptyDb(), ...JSON.parse(readFileSync(dbFile, "utf8")) };
    } catch {
      memory = emptyDb();
    }
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
    id: "ov-demo",
    userId: "user-owner",
    businessName: "Glandang Highland Farm",
    notes: "Demo owner account for SG Farm area.",
    status: "approved",
    createdAt: ts,
    reviewedAt: ts,
  });
  persist();
}

export const fallbackStore = {
  async init() {
    loadJson();
    await seedIfEmpty();
  },

  audit(actorId: string | undefined, action: string, meta: Record<string, unknown> = {}) {
    memory.auditLogs.unshift({ id: newId(), actorId, action, meta, createdAt: new Date().toISOString() });
    persist();
  },

  async logSearch(queryStr: string, userId?: string) {
    if (!queryStr.trim()) return;
    memory.searchEvents.unshift({ id: newId(), query: queryStr.trim(), userId, createdAt: new Date().toISOString() });
    memory.searchEvents = memory.searchEvents.slice(0, 2000);
    persist();
  },

  publicUser(u: User) {
    const { passwordHash, ...rest } = u;
    return rest;
  },

  async findUserByEmail(email: string): Promise<User | null> {
    return memory.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async findUserById(id: string): Promise<User | null> {
    return memory.users.find((u) => u.id === id) || null;
  },

  async createUser(input: { email: string; passwordHash: string; name: string; role: Role }): Promise<User> {
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

  async updateUser(id: string, patch: Partial<User>): Promise<User | null> {
    const user = memory.users.find((u) => u.id === id);
    if (!user) return null;
    Object.assign(user, patch, { updatedAt: new Date().toISOString() });
    persist();
    return user;
  },

  async listUsers(role?: Role): Promise<User[]> {
    return memory.users.filter((u) => (role ? u.role === role : true));
  },

  async categories(): Promise<Category[]> {
    return memory.categories;
  },

  async upsertCategory(cat: { id?: string; slug: string; name: string; description: string; icon: string }): Promise<Category> {
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

  async spots(status: SpotStatus | "all" = "approved"): Promise<TouristSpot[]> {
    return memory.spots.filter((s) => (status === "all" ? true : s.status === status));
  },

  async getSpot(idOrSlug: string): Promise<TouristSpot | null> {
    return memory.spots.find((s) => s.id === idOrSlug || s.slug === idOrSlug) || null;
  },

  async saveSpot(spot: TouristSpot): Promise<TouristSpot> {
    const idx = memory.spots.findIndex((s) => s.id === spot.id);
    if (idx >= 0) memory.spots[idx] = spot;
    else memory.spots.push(spot);
    persist();
    return spot;
  },

  async bumpViews(id: string): Promise<void> {
    const spot = memory.spots.find((s) => s.id === id);
    if (spot) {
      spot.viewCount += 1;
      persist();
    }
  },

  async updateSpotVerification(id: string, status: VerificationStatus, verifiedBy: string): Promise<TouristSpot | null> {
    const spot = memory.spots.find((s) => s.id === id);
    if (!spot) return null;
    spot.verificationStatus = status;
    spot.verifiedBy = verifiedBy;
    spot.lastVerifiedAt = new Date().toISOString();
    persist();
    return spot;
  },

  async toggleFavorite(userId: string, spotId: string): Promise<{ saved: boolean }> {
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

  async favoritesFor(userId: string) {
    return memory.favorites.filter((f) => f.userId === userId);
  },

  async isFavorite(userId: string, spotId: string): Promise<boolean> {
    return memory.favorites.some((f) => f.userId === userId && f.spotId === spotId);
  },

  async reviewsForSpot(spotId: string): Promise<Review[]> {
    return memory.reviews.filter((r) => r.spotId === spotId && r.status === "published");
  },

  async allReviews(): Promise<Review[]> {
    return memory.reviews;
  },

  async getReview(id: string): Promise<Review | null> {
    return memory.reviews.find((r) => r.id === id) || null;
  },

  async addReview(review: Review): Promise<Review> {
    memory.reviews = memory.reviews.filter((r) => !(r.userId === review.userId && r.spotId === review.spotId));
    memory.reviews.unshift(review);
    persist();
    return review;
  },

  async hideReview(id: string): Promise<Review | null> {
    const r = memory.reviews.find((x) => x.id === id);
    if (r) {
      r.status = "hidden";
      persist();
    }
    return r || null;
  },

  async tripsFor(userId: string): Promise<Trip[]> {
    return memory.trips.filter((t) => t.userId === userId);
  },

  async getTrip(id: string): Promise<Trip | null> {
    return memory.trips.find((t) => t.id === id) || null;
  },

  async saveTrip(trip: Trip): Promise<Trip> {
    const idx = memory.trips.findIndex((t) => t.id === trip.id);
    if (idx >= 0) memory.trips[idx] = trip;
    else memory.trips.push(trip);
    persist();
    return trip;
  },

  async deleteTrip(id: string, userId: string): Promise<boolean> {
    const trip = memory.trips.find((t) => t.id === id);
    if (!trip || trip.userId !== userId) return false;
    memory.trips = memory.trips.filter((t) => t.id !== id);
    persist();
    return true;
  },

  // Saved Routes (Feature 2)
  async savedRoutesFor(userId: string): Promise<SavedRoute[]> {
    return memory.savedRoutes.filter((r) => r.userId === userId);
  },

  async saveRoute(route: SavedRoute): Promise<SavedRoute> {
    const idx = memory.savedRoutes.findIndex((r) => r.id === route.id);
    if (idx >= 0) memory.savedRoutes[idx] = route;
    else memory.savedRoutes.push(route);
    persist();
    return route;
  },

  async deleteRoute(id: string, userId: string): Promise<boolean> {
    const existing = memory.savedRoutes.find((r) => r.id === id && r.userId === userId);
    if (!existing) return false;
    memory.savedRoutes = memory.savedRoutes.filter((r) => r.id !== id);
    persist();
    return true;
  },

  async rewards(includeInactive = false): Promise<Reward[]> {
    return includeInactive ? memory.rewards : memory.rewards.filter((r) => r.active);
  },

  async saveReward(reward: Reward): Promise<Reward> {
    const idx = memory.rewards.findIndex((r) => r.id === reward.id);
    if (idx >= 0) memory.rewards[idx] = reward;
    else memory.rewards.push(reward);
    persist();
    return reward;
  },

  async addPoints(userId: string, amount: number, reason: string): Promise<User | null> {
    const user = memory.users.find((u) => u.id === userId);
    if (!user) return null;
    user.points = Math.max(0, user.points + amount);
    memory.points.unshift({ id: newId(), userId, amount, reason, createdAt: new Date().toISOString() });
    this.maybeBadges(user);
    persist();
    return user;
  },

  async redeem(userId: string, rewardId: string, idempotencyKey?: string): Promise<{ redemption: any; voucher: Voucher; user: any; reward: Reward } | { error: string }> {
    if (idempotencyKey) {
      const existing = memory.vouchers.find((v) => v.idempotencyKey === idempotencyKey);
      if (existing) {
        const user = memory.users.find((u) => u.id === userId);
        const reward = memory.rewards.find((r) => r.id === rewardId);
        return {
          redemption: { id: existing.id, userId, rewardId, createdAt: existing.createdAt },
          voucher: existing,
          user: user ? this.publicUser(user) : null,
          reward: reward!,
        };
      }
    }

    const user = memory.users.find((u) => u.id === userId);
    const reward = memory.rewards.find((r) => r.id === rewardId && r.active);
    if (!user || !reward) return { error: "Reward not found" };
    if (reward.stock <= 0) return { error: "Out of stock" };
    if (user.points < reward.pointsCost) return { error: "Not enough points" };

    user.points -= reward.pointsCost;
    reward.stock -= 1;

    const voucherCode = `TUPI-${randomBytes(2).toString("hex").toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const voucher: Voucher = {
      id: newId(),
      code: voucherCode,
      userId,
      rewardId,
      rewardName: reward.name,
      rewardDescription: reward.description,
      status: "active",
      expiresAt,
      idempotencyKey,
      createdAt: new Date().toISOString(),
    };
    memory.vouchers.unshift(voucher);

    memory.points.unshift({
      id: newId(),
      userId,
      amount: -reward.pointsCost,
      reason: `Redeemed ${reward.name}`,
      createdAt: new Date().toISOString(),
    });

    const redemption = { id: voucher.id, userId, rewardId, createdAt: new Date().toISOString() };
    memory.userRewards.unshift(redemption);

    this.notify(userId, "Reward redeemed!", `You redeemed ${reward.name}. Voucher code: ${voucherCode}`, "reward");
    persist();

    return { redemption, voucher, user: this.publicUser(user), reward };
  },

  async vouchersFor(userId: string): Promise<Voucher[]> {
    return memory.vouchers.filter((v) => v.userId === userId);
  },

  async getVoucherByCode(code: string): Promise<Voucher | null> {
    return memory.vouchers.find((v) => v.code.toUpperCase() === code.trim().toUpperCase()) || null;
  },

  async verifyAndRedeemVoucher(code: string, verifiedByUserId: string): Promise<{ success: boolean; voucher?: Voucher; error?: string }> {
    const v = memory.vouchers.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());
    if (!v) return { success: false, error: "Voucher not found" };
    if (v.status === "redeemed") {
      return { success: false, error: `Voucher was already redeemed on ${v.redeemedAt}` };
    }
    if (v.status === "expired" || new Date(v.expiresAt) < new Date()) {
      v.status = "expired";
      persist();
      return { success: false, error: "Voucher has expired" };
    }
    v.status = "redeemed";
    v.redeemedAt = new Date().toISOString();
    v.redeemedBy = verifiedByUserId;
    persist();
    return { success: true, voucher: v };
  },

  async pointsHistory(userId: string) {
    return memory.points.filter((p) => p.userId === userId);
  },

  async redemptions(userId?: string) {
    return memory.userRewards.filter((r) => (userId ? r.userId === userId : true));
  },

  async badges() {
    return memory.badges;
  },

  async badgesFor(userId: string) {
    return memory.userBadges
      .filter((b) => b.userId === userId)
      .map((b) => ({ ...b, badge: memory.badges.find((x) => x.id === b.badgeId) }));
  },

  maybeBadges(user: User) {
    const award = (slug: string) => {
      const badge = memory.badges.find((b) => b.slug === slug);
      if (!badge) return;
      if (memory.userBadges.some((b) => b.userId === user.id && b.badgeId === badge.id)) return;
      memory.userBadges.push({ userId: user.id, badgeId: badge.id, earnedAt: new Date().toISOString() });
      this.notify(user.id, "Badge unlocked", badge.name, "badge");
    };
    const visits = memory.visits.filter((v) => v.userId === user.id).length;
    if (visits >= 1) award("first-adventure");
    if (visits >= 3) award("tupi-explorer");
    if (memory.favorites.filter((f) => f.userId === user.id).some((f) => memory.spots.find((s) => s.id === f.spotId)?.categoryId === "cat-nature")) {
      award("nature-seeker");
    }
    if (memory.reviews.some((r) => r.userId === user.id)) award("local-discoverer");
    if (user.points >= 300) award("tupi-champion");
  },

  async visitsFor(userId: string) {
    return memory.visits.filter((v) => v.userId === userId);
  },

  async checkIn(userId: string, spotId: string): Promise<{ visit: any; awarded: boolean; error?: string }> {
    const spot = memory.spots.find((s) => s.id === spotId);
    if (!spot) return { visit: null, awarded: false, error: "Spot not found" };

    const todayStr = new Date().toISOString().slice(0, 10);
    const existingToday = memory.visits.find(
      (v) => v.userId === userId && v.spotId === spotId && v.createdAt.slice(0, 10) === todayStr
    );
    if (existingToday) return { visit: existingToday, awarded: false };

    const visit = { id: newId(), userId, spotId, createdAt: new Date().toISOString() };
    memory.visits.unshift(visit);
    spot.visitCount += 1;
    await this.addPoints(userId, 25, `Visited ${spot.name}`);
    this.notify(userId, "Visit recorded", `Nice work exploring ${spot.name}. +25 points`, "visit");
    persist();
    return { visit, awarded: true };
  },

  async notifications(userId: string): Promise<Notification[]> {
    return memory.notifications.filter((n) => n.userId === userId);
  },

  async notify(userId: string, title: string, body: string, type: string): Promise<Notification> {
    const n: Notification = { id: newId(), userId, title, body, type, read: false, createdAt: new Date().toISOString() };
    memory.notifications.unshift(n);
    persist();
    return n;
  },

  async markRead(userId: string, id?: string): Promise<void> {
    memory.notifications.forEach((n) => {
      if (n.userId === userId && (!id || n.id === id)) n.read = true;
    });
    persist();
  },

  async ownerApps() {
    return memory.ownerVerifications;
  },

  async addOwnerApp(app: DatabaseShape["ownerVerifications"][number]) {
    memory.ownerVerifications.unshift(app);
    persist();
    return app;
  },

  async setOwnerApp(id: string, status: string) {
    const app = memory.ownerVerifications.find((a) => a.id === id);
    if (!app) return null;
    app.status = status;
    app.reviewedAt = new Date().toISOString();
    const user = memory.users.find((u) => u.id === app.userId);
    if (user && status === "approved") user.role = "owner";
    this.notify(app.userId, "Owner application update", `Status: ${status}`, "owner");
    persist();
    return app;
  },

  async reports() {
    return memory.reports;
  },

  async addReport(report: DatabaseShape["reports"][number]) {
    memory.reports.unshift(report);
    persist();
    return report;
  },

  async saveRefresh(userId: string, tokenHash: string, expiresAt: string) {
    memory.refreshTokens.push({ id: newId(), userId, tokenHash, expiresAt, revoked: false });
    persist();
  },

  async findRefresh(tokenHash: string) {
    return memory.refreshTokens.find((t) => t.tokenHash === tokenHash && !t.revoked) || null;
  },

  async revokeRefresh(tokenHash: string) {
    const t = memory.refreshTokens.find((x) => x.tokenHash === tokenHash);
    if (t) {
      t.revoked = true;
      persist();
    }
  },

  async saveReset(userId: string, tokenHash: string, expiresAt: string) {
    memory.passwordResets.push({ id: newId(), userId, tokenHash, expiresAt, used: false });
    persist();
  },

  async consumeReset(tokenHash: string) {
    const row = memory.passwordResets.find((r) => r.tokenHash === tokenHash && !r.used && new Date(r.expiresAt) > new Date());
    if (!row) return null;
    row.used = true;
    persist();
    return row;
  },

  async analytics() {
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
        activeVouchers: memory.vouchers.filter((v) => v.status === "active").length,
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
};
