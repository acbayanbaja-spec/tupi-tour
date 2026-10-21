import { createHash } from "crypto";
import { config } from "./config.js";
import { fallbackStore } from "./db/fallbackStore.js";
import { runMigrations } from "./db/migrate.js";
import { checkDbReadiness, getPool } from "./db/pool.js";
import { pgRepo } from "./db/repo.js";
import type {
  Category,
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
} from "./types.js";

let usingPg = false;

export async function initDb(): Promise<void> {
  const readiness = await checkDbReadiness();
  if (readiness.ready && config.databaseUrl) {
    try {
      await runMigrations();
      usingPg = true;
      console.log("Connected to Supabase PostgreSQL database as authoritative production store.");
      return;
    } catch (err) {
      console.error("PostgreSQL migration failed:", err);
      if (config.isProduction) {
        throw new Error(`Production startup aborted: PostgreSQL database migration failed: ${(err as Error).message}`);
      }
    }
  }

  if (config.isProduction) {
    throw new Error(
      "FATAL: Production mode requires a working Supabase PostgreSQL connection. Set DATABASE_URL and verify connectivity."
    );
  }

  console.warn("⚠️ Warning: Running in DEVELOPMENT mode using isolated fallback store. PostgreSQL is not connected.");
  await fallbackStore.init();
  usingPg = false;
}

function target() {
  return usingPg ? pgRepo : fallbackStore;
}

export const store = {
  isUsingPostgres() {
    return usingPg;
  },

  publicUser(u: User) {
    const { passwordHash, ...rest } = u;
    return rest;
  },

  async audit(actorId: string | undefined, action: string, meta: Record<string, unknown> = {}) {
    return target().audit(actorId, action, meta);
  },

  async logSearch(query: string, userId?: string) {
    return target().logSearch(query, userId);
  },

  async findUserByEmail(email: string): Promise<User | null> {
    return target().findUserByEmail(email);
  },

  async findUserById(id: string): Promise<User | null> {
    return target().findUserById(id);
  },

  async createUser(input: { email: string; passwordHash: string; name: string; role: Role }): Promise<User> {
    return target().createUser(input);
  },

  async updateUser(id: string, patch: Partial<User>): Promise<User | null> {
    return target().updateUser(id, patch);
  },

  async listUsers(role?: Role): Promise<User[]> {
    return target().listUsers(role);
  },

  async categories(): Promise<Category[]> {
    return target().categories();
  },

  async upsertCategory(cat: { id?: string; slug: string; name: string; description: string; icon: string }): Promise<Category> {
    return target().upsertCategory(cat);
  },

  async spots(status: SpotStatus | "all" = "approved"): Promise<TouristSpot[]> {
    return target().spots(status);
  },

  async getSpot(idOrSlug: string): Promise<TouristSpot | null> {
    return target().getSpot(idOrSlug);
  },

  async saveSpot(spot: TouristSpot): Promise<TouristSpot> {
    return target().saveSpot(spot);
  },

  async bumpViews(id: string): Promise<void> {
    return target().bumpViews(id);
  },

  async updateSpotVerification(id: string, status: VerificationStatus, verifiedBy: string): Promise<TouristSpot | null> {
    return target().updateSpotVerification(id, status, verifiedBy);
  },

  async deleteSpot(id: string): Promise<boolean> {
    return target().deleteSpot(id);
  },

  async toggleFavorite(userId: string, spotId: string): Promise<{ saved: boolean }> {
    return target().toggleFavorite(userId, spotId);
  },

  async favoritesFor(userId: string) {
    return target().favoritesFor(userId);
  },

  async isFavorite(userId: string, spotId: string): Promise<boolean> {
    return target().isFavorite(userId, spotId);
  },

  async reviewsForSpot(spotId: string): Promise<Review[]> {
    return target().reviewsForSpot(spotId);
  },

  async allReviews(): Promise<Review[]> {
    return target().allReviews();
  },

  async getReview(id: string): Promise<Review | null> {
    return target().getReview(id);
  },

  async addReview(review: Review): Promise<Review> {
    return target().addReview(review);
  },

  async hideReview(id: string): Promise<Review | null> {
    return target().hideReview(id);
  },

  async tripsFor(userId: string): Promise<Trip[]> {
    return target().tripsFor(userId);
  },

  async getTrip(id: string): Promise<Trip | null> {
    return target().getTrip(id);
  },

  async saveTrip(trip: Trip): Promise<Trip> {
    return target().saveTrip(trip);
  },

  async deleteTrip(id: string, userId: string): Promise<boolean> {
    return target().deleteTrip(id, userId);
  },

  // Saved Routes (Feature 2)
  async savedRoutesFor(userId: string): Promise<SavedRoute[]> {
    return target().savedRoutesFor(userId);
  },

  async saveRoute(route: SavedRoute): Promise<SavedRoute> {
    return target().saveRoute(route);
  },

  async deleteRoute(id: string, userId: string): Promise<boolean> {
    return target().deleteRoute(id, userId);
  },

  async rewards(includeInactive = false): Promise<Reward[]> {
    return target().rewards(includeInactive);
  },

  async saveReward(reward: Reward): Promise<Reward> {
    return target().saveReward(reward);
  },

  async addPoints(userId: string, amount: number, reason: string): Promise<User | null> {
    return target().addPoints(userId, amount, reason);
  },

  async redeem(userId: string, rewardId: string, idempotencyKey?: string): Promise<{ redemption: any; voucher: Voucher; user: any; reward: Reward } | { error: string }> {
    return target().redeem(userId, rewardId, idempotencyKey);
  },

  async vouchersFor(userId: string): Promise<Voucher[]> {
    return target().vouchersFor(userId);
  },

  async getVoucherByCode(code: string): Promise<Voucher | null> {
    return target().getVoucherByCode(code);
  },

  async verifyAndRedeemVoucher(code: string, verifiedByUserId: string): Promise<{ success: boolean; voucher?: Voucher; error?: string }> {
    return target().verifyAndRedeemVoucher(code, verifiedByUserId);
  },

  async pointsHistory(userId: string) {
    return target().pointsHistory(userId);
  },

  async redemptions(userId?: string) {
    return target().redemptions(userId);
  },

  async badges() {
    return target().badges();
  },

  async badgesFor(userId: string) {
    return target().badgesFor(userId);
  },

  async visitsFor(userId: string) {
    return target().visitsFor(userId);
  },

  async checkIn(userId: string, spotId: string): Promise<{ visit: any; awarded: boolean; error?: string }> {
    return target().checkIn(userId, spotId);
  },

  async notifications(userId: string): Promise<Notification[]> {
    return target().notifications(userId);
  },

  async notify(userId: string, title: string, body: string, type: string): Promise<Notification> {
    return target().notify(userId, title, body, type);
  },

  async markRead(userId: string, id?: string): Promise<void> {
    return target().markRead(userId, id);
  },

  async ownerApps() {
    return target().ownerApps();
  },

  async addOwnerApp(app: any) {
    return target().addOwnerApp(app);
  },

  async setOwnerApp(id: string, status: string) {
    return target().setOwnerApp(id, status);
  },

  async reports() {
    return target().reports();
  },

  async addReport(report: any) {
    return target().addReport(report);
  },

  async saveRefresh(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    return target().saveRefresh(userId, tokenHash, expiresAt);
  },

  async findRefresh(tokenHash: string): Promise<any | null> {
    return target().findRefresh(tokenHash);
  },

  async revokeRefresh(tokenHash: string): Promise<void> {
    return target().revokeRefresh(tokenHash);
  },

  async saveReset(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    return target().saveReset(userId, tokenHash, expiresAt);
  },

  async consumeReset(tokenHash: string): Promise<any | null> {
    return target().consumeReset(tokenHash);
  },

  async analytics() {
    return target().analytics();
  },
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function spotRating(spotId: string) {
  const reviews = await store.reviewsForSpot(spotId);
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const dist = [1, 2, 3, 4, 5].map((n) => reviews.filter((r) => r.rating === n).length);
  return { average: Number(avg.toFixed(2)), count: reviews.length, distribution: dist };
}
