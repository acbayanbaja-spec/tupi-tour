import { randomBytes } from "crypto";
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
} from "../types.js";
import { query, withTransaction } from "./pool.js";

function newId(): string {
  return "id-" + randomBytes(8).toString("hex");
}

function generateVoucherCode(): string {
  const part1 = randomBytes(2).toString("hex").toUpperCase();
  const part2 = Math.floor(1000 + Math.random() * 9000);
  return `TUPI-${part1}-${part2}`;
}

export const pgRepo = {
  // --- Audit & Search Logging ---
  async audit(actorId: string | undefined, action: string, meta: Record<string, unknown> = {}) {
    const id = newId();
    await query(
      "INSERT INTO audit_logs (id, actor_id, action, meta, created_at) VALUES ($1, $2, $3, $4, now())",
      [id, actorId || null, action, JSON.stringify(meta)]
    );
  },

  async logSearch(qStr: string, userId?: string) {
    if (!qStr.trim()) return;
    await query(
      "INSERT INTO search_events (id, query, user_id, created_at) VALUES ($1, $2, $3, now())",
      [newId(), qStr.trim(), userId || null]
    );
  },

  publicUser(u: User) {
    const { passwordHash, ...rest } = u;
    return rest;
  },

  // --- Users ---
  async findUserByEmail(email: string): Promise<User | null> {
    const res = await query(
      "SELECT * FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );
    if (!res.rows.length) return null;
    return this.mapUser(res.rows[0]);
  },

  async findUserById(id: string): Promise<User | null> {
    const res = await query("SELECT * FROM users WHERE id = $1", [id]);
    if (!res.rows.length) return null;
    return this.mapUser(res.rows[0]);
  },

  async createUser(input: { email: string; passwordHash: string; name: string; role: Role }): Promise<User> {
    const id = newId();
    const res = await query(
      `INSERT INTO users (id, email, password_hash, name, role, interests, onboarding_complete, email_verified, points, created_at, updated_at)
       VALUES ($1, LOWER($2), $3, $4, $5, '[]', false, true, 0, now(), now())
       RETURNING *`,
      [id, input.email, input.passwordHash, input.name, input.role]
    );
    return this.mapUser(res.rows[0]);
  },

  async updateUser(id: string, patch: Partial<User>): Promise<User | null> {
    const existing = await this.findUserById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (patch.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(patch.name);
    }
    if (patch.passwordHash !== undefined) {
      fields.push(`password_hash = $${idx++}`);
      values.push(patch.passwordHash);
    }
    if (patch.avatarUrl !== undefined) {
      fields.push(`avatar_url = $${idx++}`);
      values.push(patch.avatarUrl);
    }
    if (patch.phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(patch.phone);
    }
    if (patch.bio !== undefined) {
      fields.push(`bio = $${idx++}`);
      values.push(patch.bio);
    }
    if (patch.interests !== undefined) {
      fields.push(`interests = $${idx++}`);
      values.push(JSON.stringify(patch.interests));
    }
    if (patch.budgetPreference !== undefined) {
      fields.push(`budget_preference = $${idx++}`);
      values.push(patch.budgetPreference);
    }
    if (patch.tripStyle !== undefined) {
      fields.push(`trip_style = $${idx++}`);
      values.push(patch.tripStyle);
    }
    if (patch.onboardingComplete !== undefined) {
      fields.push(`onboarding_complete = $${idx++}`);
      values.push(patch.onboardingComplete);
    }
    if (patch.points !== undefined) {
      fields.push(`points = $${idx++}`);
      values.push(patch.points);
    }
    if (patch.role !== undefined) {
      fields.push(`role = $${idx++}`);
      values.push(patch.role);
    }

    if (!fields.length) return existing;

    fields.push("updated_at = now()");
    values.push(id);

    const qStr = `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
    const res = await query(qStr, values);
    return res.rows.length ? this.mapUser(res.rows[0]) : null;
  },

  async listUsers(role?: Role): Promise<User[]> {
    const res = role
      ? await query("SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC", [role])
      : await query("SELECT * FROM users ORDER BY created_at DESC");
    return res.rows.map((r) => this.mapUser(r));
  },

  // --- Categories ---
  async categories(): Promise<Category[]> {
    const res = await query("SELECT * FROM categories ORDER BY name ASC");
    return res.rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description || "",
      icon: r.icon || "Compass",
    }));
  },

  async upsertCategory(cat: { id?: string; slug: string; name: string; description: string; icon: string }): Promise<Category> {
    const id = cat.id || newId();
    const res = await query(
      `INSERT INTO categories (id, slug, name, description, icon)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon
       RETURNING *`,
      [id, cat.slug, cat.name, cat.description, cat.icon]
    );
    const r = res.rows[0];
    return { id: r.id, slug: r.slug, name: r.name, description: r.description, icon: r.icon };
  },

  // --- Tourist Spots ---
  async spots(status: SpotStatus | "all" = "approved"): Promise<TouristSpot[]> {
    const qStr =
      status === "all"
        ? "SELECT s.*, COALESCE(json_agg(json_build_object('url', i.url, 'alt', i.alt)) FILTER (WHERE i.id IS NOT NULL), '[]') as images FROM tourist_spots s LEFT JOIN tourist_spot_images i ON s.id = i.spot_id GROUP BY s.id ORDER BY s.popularity_score DESC"
        : "SELECT s.*, COALESCE(json_agg(json_build_object('url', i.url, 'alt', i.alt)) FILTER (WHERE i.id IS NOT NULL), '[]') as images FROM tourist_spots s LEFT JOIN tourist_spot_images i ON s.id = i.spot_id WHERE s.status = $1 GROUP BY s.id ORDER BY s.popularity_score DESC";
    const params = status === "all" ? [] : [status];
    const res = await query(qStr, params);
    return res.rows.map((r) => this.mapSpot(r));
  },

  async getSpot(idOrSlug: string): Promise<TouristSpot | null> {
    const res = await query(
      `SELECT s.*, COALESCE(json_agg(json_build_object('url', i.url, 'alt', i.alt)) FILTER (WHERE i.id IS NOT NULL), '[]') as images
       FROM tourist_spots s
       LEFT JOIN tourist_spot_images i ON s.id = i.spot_id
       WHERE s.id = $1 OR s.slug = $1
       GROUP BY s.id`,
      [idOrSlug]
    );
    if (!res.rows.length) return null;
    return this.mapSpot(res.rows[0]);
  },

  async saveSpot(spot: TouristSpot): Promise<TouristSpot> {
    return withTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO tourist_spots (
          id, slug, name, category_id, description, short_description, lat, lng,
          address, barangay, amenities, operating_hours, contact, featured,
          status, owner_id, data_source, estimated_entrance_fee, popularity_score,
          view_count, visit_count, last_verified_at, verification_status,
          verified_by, safety_guidance, emergency_contact, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20, $21, $22, $23,
          $24, $25, $26, $27, now()
        )
        ON CONFLICT (id) DO UPDATE SET
          slug = EXCLUDED.slug,
          name = EXCLUDED.name,
          category_id = EXCLUDED.category_id,
          description = EXCLUDED.description,
          short_description = EXCLUDED.short_description,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          address = EXCLUDED.address,
          barangay = EXCLUDED.barangay,
          amenities = EXCLUDED.amenities,
          operating_hours = EXCLUDED.operating_hours,
          contact = EXCLUDED.contact,
          featured = EXCLUDED.featured,
          status = EXCLUDED.status,
          owner_id = EXCLUDED.owner_id,
          data_source = EXCLUDED.data_source,
          estimated_entrance_fee = EXCLUDED.estimated_entrance_fee,
          popularity_score = EXCLUDED.popularity_score,
          view_count = EXCLUDED.view_count,
          visit_count = EXCLUDED.visit_count,
          last_verified_at = EXCLUDED.last_verified_at,
          verification_status = EXCLUDED.verification_status,
          verified_by = EXCLUDED.verified_by,
          safety_guidance = EXCLUDED.safety_guidance,
          emergency_contact = EXCLUDED.emergency_contact,
          updated_at = now()
        RETURNING *`,
        [
          spot.id,
          spot.slug,
          spot.name,
          spot.categoryId,
          spot.description,
          spot.shortDescription,
          spot.lat,
          spot.lng,
          spot.address,
          spot.barangay,
          JSON.stringify(spot.amenities || []),
          JSON.stringify(spot.operatingHours || {}),
          spot.contact || null,
          spot.featured || false,
          spot.status,
          spot.ownerId || null,
          spot.dataSource || "curated",
          spot.estimatedEntranceFee || null,
          spot.popularityScore || 0,
          spot.viewCount || 0,
          spot.visitCount || 0,
          spot.lastVerifiedAt || new Date().toISOString(),
          spot.verificationStatus || "verified",
          spot.verifiedBy || null,
          JSON.stringify(spot.safetyGuidance || []),
          spot.emergencyContact || null,
          spot.createdAt || new Date().toISOString(),
        ]
      );

      // Re-sync images
      await client.query("DELETE FROM tourist_spot_images WHERE spot_id = $1", [spot.id]);
      if (spot.images && spot.images.length > 0) {
        for (let i = 0; i < spot.images.length; i++) {
          const img = spot.images[i];
          await client.query(
            "INSERT INTO tourist_spot_images (id, spot_id, url, alt, sort_order) VALUES ($1, $2, $3, $4, $5)",
            [newId(), spot.id, img.url, img.alt, i]
          );
        }
      }

      return this.mapSpot({ ...res.rows[0], images: spot.images || [] });
    });
  },

  async bumpViews(id: string): Promise<void> {
    await query("UPDATE tourist_spots SET view_count = view_count + 1 WHERE id = $1", [id]);
  },

  async updateSpotVerification(id: string, status: VerificationStatus, verifiedBy: string): Promise<TouristSpot | null> {
    const res = await query(
      "UPDATE tourist_spots SET verification_status = $1, verified_by = $2, last_verified_at = now(), updated_at = now() WHERE id = $3 RETURNING *",
      [status, verifiedBy, id]
    );
    if (!res.rows.length) return null;
    return this.getSpot(id);
  },

  // --- Favorites ---
  async toggleFavorite(userId: string, spotId: string): Promise<{ saved: boolean }> {
    const check = await query(
      "SELECT 1 FROM favorites WHERE user_id = $1 AND spot_id = $2",
      [userId, spotId]
    );
    if (check.rows.length > 0) {
      await query("DELETE FROM favorites WHERE user_id = $1 AND spot_id = $2", [userId, spotId]);
      return { saved: false };
    } else {
      await query("INSERT INTO favorites (user_id, spot_id, created_at) VALUES ($1, $2, now())", [userId, spotId]);
      return { saved: true };
    }
  },

  async favoritesFor(userId: string): Promise<{ userId: string; spotId: string; createdAt: string }[]> {
    const res = await query(
      "SELECT user_id, spot_id, created_at FROM favorites WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return res.rows.map((r) => ({
      userId: r.user_id,
      spotId: r.spot_id,
      createdAt: r.created_at,
    }));
  },

  async isFavorite(userId: string, spotId: string): Promise<boolean> {
    const res = await query(
      "SELECT 1 FROM favorites WHERE user_id = $1 AND spot_id = $2",
      [userId, spotId]
    );
    return res.rows.length > 0;
  },

  // --- Reviews ---
  async reviewsForSpot(spotId: string): Promise<Review[]> {
    const res = await query(
      "SELECT * FROM reviews WHERE spot_id = $1 AND status = 'published' ORDER BY created_at DESC",
      [spotId]
    );
    return res.rows.map((r) => this.mapReview(r));
  },

  async allReviews(): Promise<Review[]> {
    const res = await query("SELECT * FROM reviews ORDER BY created_at DESC");
    return res.rows.map((r) => this.mapReview(r));
  },

  async getReview(id: string): Promise<Review | null> {
    const res = await query("SELECT * FROM reviews WHERE id = $1", [id]);
    if (!res.rows.length) return null;
    return this.mapReview(res.rows[0]);
  },

  async addReview(review: Review): Promise<Review> {
    const res = await query(
      `INSERT INTO reviews (id, user_id, spot_id, rating, body, photos, helpful_count, helpful_by, owner_reply, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, spot_id) DO UPDATE SET
         rating = EXCLUDED.rating,
         body = EXCLUDED.body,
         photos = EXCLUDED.photos,
         helpful_count = EXCLUDED.helpful_count,
         helpful_by = EXCLUDED.helpful_by,
         owner_reply = EXCLUDED.owner_reply,
         status = EXCLUDED.status
       RETURNING *`,
      [
        review.id || newId(),
        review.userId,
        review.spotId,
        review.rating,
        review.body,
        JSON.stringify(review.photos || []),
        review.helpfulCount || 0,
        JSON.stringify(review.helpfulBy || []),
        review.ownerReply || null,
        review.status || "published",
        review.createdAt || new Date().toISOString(),
      ]
    );
    return this.mapReview(res.rows[0]);
  },

  async hideReview(id: string): Promise<Review | null> {
    const res = await query("UPDATE reviews SET status = 'hidden' WHERE id = $1 RETURNING *", [id]);
    if (!res.rows.length) return null;
    return this.mapReview(res.rows[0]);
  },

  // --- Trips ---
  async tripsFor(userId: string): Promise<Trip[]> {
    const res = await query(
      `SELECT t.*, COALESCE(json_agg(td.spot_id ORDER BY td.sort_order) FILTER (WHERE td.spot_id IS NOT NULL), '[]') as spot_ids
       FROM trips t
       LEFT JOIN trip_destinations td ON t.id = td.trip_id
       WHERE t.user_id = $1
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
      [userId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      notes: r.notes || "",
      spotIds: r.spot_ids || [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async getTrip(id: string): Promise<Trip | null> {
    const res = await query(
      `SELECT t.*, COALESCE(json_agg(td.spot_id ORDER BY td.sort_order) FILTER (WHERE td.spot_id IS NOT NULL), '[]') as spot_ids
       FROM trips t
       LEFT JOIN trip_destinations td ON t.id = td.trip_id
       WHERE t.id = $1
       GROUP BY t.id`,
      [id]
    );
    if (!res.rows.length) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      name: r.name,
      notes: r.notes || "",
      spotIds: r.spot_ids || [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  async saveTrip(trip: Trip): Promise<Trip> {
    return withTransaction(async (client) => {
      await client.query(
        `INSERT INTO trips (id, user_id, name, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           notes = EXCLUDED.notes,
           updated_at = now()`,
        [trip.id, trip.userId, trip.name, trip.notes || null, trip.createdAt || new Date().toISOString()]
      );

      await client.query("DELETE FROM trip_destinations WHERE trip_id = $1", [trip.id]);
      if (trip.spotIds?.length) {
        for (let i = 0; i < trip.spotIds.length; i++) {
          await client.query(
            "INSERT INTO trip_destinations (id, trip_id, spot_id, sort_order) VALUES ($1, $2, $3, $4)",
            [newId(), trip.id, trip.spotIds[i], i]
          );
        }
      }
      return trip;
    });
  },

  async deleteTrip(id: string, userId: string): Promise<boolean> {
    const res = await query("DELETE FROM trips WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
    return res.rows.length > 0;
  },

  // --- Saved Routes (Feature 2) ---
  async savedRoutesFor(userId: string): Promise<SavedRoute[]> {
    const res = await query(
      "SELECT * FROM saved_routes WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      stops: typeof r.stops === "string" ? JSON.parse(r.stops) : r.stops,
      totalDistanceKm: Number(r.total_distance_km),
      estimatedMinutes: Number(r.estimated_minutes),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async saveRoute(route: SavedRoute): Promise<SavedRoute> {
    const res = await query(
      `INSERT INTO saved_routes (id, user_id, name, stops, total_distance_km, estimated_minutes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         stops = EXCLUDED.stops,
         total_distance_km = EXCLUDED.total_distance_km,
         estimated_minutes = EXCLUDED.estimated_minutes,
         updated_at = now()
       RETURNING *`,
      [
        route.id || newId(),
        route.userId,
        route.name,
        JSON.stringify(route.stops || []),
        route.totalDistanceKm || 0,
        route.estimatedMinutes || 0,
        route.createdAt || new Date().toISOString(),
      ]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      name: r.name,
      stops: typeof r.stops === "string" ? JSON.parse(r.stops) : r.stops,
      totalDistanceKm: Number(r.total_distance_km),
      estimatedMinutes: Number(r.estimated_minutes),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  async deleteRoute(id: string, userId: string): Promise<boolean> {
    const res = await query("DELETE FROM saved_routes WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
    return res.rows.length > 0;
  },

  // --- Rewards & Verifiable Vouchers (Feature 5) ---
  async rewards(includeInactive = false): Promise<Reward[]> {
    const qStr = includeInactive ? "SELECT * FROM rewards ORDER BY points_cost ASC" : "SELECT * FROM rewards WHERE active = true ORDER BY points_cost ASC";
    const res = await query(qStr);
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      pointsCost: Number(r.points_cost),
      stock: Number(r.stock),
      active: r.active,
    }));
  },

  async saveReward(reward: Reward): Promise<Reward> {
    const res = await query(
      `INSERT INTO rewards (id, name, description, points_cost, stock, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         points_cost = EXCLUDED.points_cost,
         stock = EXCLUDED.stock,
         active = EXCLUDED.active
       RETURNING *`,
      [reward.id || newId(), reward.name, reward.description, reward.pointsCost, reward.stock, reward.active]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      pointsCost: Number(r.points_cost),
      stock: Number(r.stock),
      active: r.active,
    };
  },

  async addPoints(userId: string, amount: number, reason: string): Promise<User | null> {
    return withTransaction(async (client) => {
      const userRes = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!userRes.rows.length) return null;

      const currentPoints = Number(userRes.rows[0].points || 0);
      const newPoints = Math.max(0, currentPoints + amount);

      const updatedRes = await client.query(
        "UPDATE users SET points = $1, updated_at = now() WHERE id = $2 RETURNING *",
        [newPoints, userId]
      );

      await client.query(
        "INSERT INTO points_transactions (id, user_id, amount, reason, created_at) VALUES ($1, $2, $3, $4, now())",
        [newId(), userId, amount, reason]
      );

      const user = this.mapUser(updatedRes.rows[0]);
      await this.maybeBadgesTx(client, user);
      return user;
    });
  },

  async redeem(userId: string, rewardId: string, idempotencyKey?: string): Promise<{ redemption: any; voucher: Voucher; user: any; reward: Reward } | { error: string }> {
    return withTransaction(async (client) => {
      // 1. Idempotency check if key provided
      if (idempotencyKey) {
        const existingVoucher = await client.query(
          "SELECT v.*, r.name as reward_name, r.description as reward_description FROM vouchers v JOIN rewards r ON v.reward_id = r.id WHERE v.idempotency_key = $1",
          [idempotencyKey]
        );
        if (existingVoucher.rows.length) {
          const userRes = await client.query("SELECT * FROM users WHERE id = $1", [userId]);
          const rewardRes = await client.query("SELECT * FROM rewards WHERE id = $1", [rewardId]);
          return {
            redemption: { id: existingVoucher.rows[0].id, userId, rewardId, createdAt: existingVoucher.rows[0].created_at },
            voucher: this.mapVoucher(existingVoucher.rows[0]),
            user: this.publicUser(this.mapUser(userRes.rows[0])),
            reward: rewardRes.rows[0],
          };
        }
      }

      // 2. Lock user row
      const userRes = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!userRes.rows.length) return { error: "User account not found" };
      const user = userRes.rows[0];

      // 3. Lock reward row
      const rewardRes = await client.query("SELECT * FROM rewards WHERE id = $1 FOR UPDATE", [rewardId]);
      if (!rewardRes.rows.length) return { error: "Reward not found" };
      const reward = rewardRes.rows[0];

      if (!reward.active) return { error: "This reward is currently unavailable" };
      if (reward.stock <= 0) return { error: "Reward is out of stock" };
      if (user.points < reward.points_cost) {
        return { error: `Not enough points. You need ${reward.points_cost} points (have ${user.points}).` };
      }

      // 4. Deduct points and reduce stock atomically
      const updatedUserRes = await client.query(
        "UPDATE users SET points = points - $1, updated_at = now() WHERE id = $2 RETURNING *",
        [reward.points_cost, userId]
      );
      const updatedRewardRes = await client.query(
        "UPDATE rewards SET stock = stock - 1 WHERE id = $1 RETURNING *",
        [rewardId]
      );

      // 5. Generate unique voucher with 30-day expiry
      const voucherId = newId();
      const voucherCode = generateVoucherCode();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const voucherRes = await client.query(
        `INSERT INTO vouchers (id, code, user_id, reward_id, status, expires_at, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, 'active', $5, $6, now())
         RETURNING *`,
        [voucherId, voucherCode, userId, rewardId, expiresAt, idempotencyKey || null]
      );

      // 6. Record user_reward and points_transaction
      const redemptionId = newId();
      await client.query(
        "INSERT INTO user_rewards (id, user_id, reward_id, voucher_id, created_at) VALUES ($1, $2, $3, $4, now())",
        [redemptionId, userId, rewardId, voucherId]
      );

      await client.query(
        "INSERT INTO points_transactions (id, user_id, amount, reason, created_at) VALUES ($1, $2, $3, $4, now())",
        [newId(), userId, -reward.points_cost, `Redeemed ${reward.name}`]
      );

      // 7. Notification
      await client.query(
        "INSERT INTO notifications (id, user_id, title, body, type, read, created_at) VALUES ($1, $2, $3, $4, 'reward', false, now())",
        [newId(), userId, "Reward redeemed!", `You redeemed ${reward.name}. Voucher code: ${voucherCode}`]
      );

      const voucherRow = voucherRes.rows[0];
      voucherRow.reward_name = reward.name;
      voucherRow.reward_description = reward.description;

      return {
        redemption: { id: redemptionId, userId, rewardId, voucherId, createdAt: new Date().toISOString() },
        voucher: this.mapVoucher(voucherRow),
        user: this.publicUser(this.mapUser(updatedUserRes.rows[0])),
        reward: {
          id: updatedRewardRes.rows[0].id,
          name: updatedRewardRes.rows[0].name,
          description: updatedRewardRes.rows[0].description,
          pointsCost: Number(updatedRewardRes.rows[0].points_cost),
          stock: Number(updatedRewardRes.rows[0].stock),
          active: updatedRewardRes.rows[0].active,
        },
      };
    });
  },

  async vouchersFor(userId: string): Promise<Voucher[]> {
    const res = await query(
      `SELECT v.*, r.name as reward_name, r.description as reward_description
       FROM vouchers v
       JOIN rewards r ON v.reward_id = r.id
       WHERE v.user_id = $1
       ORDER BY v.created_at DESC`,
      [userId]
    );
    return res.rows.map((r) => this.mapVoucher(r));
  },

  async getVoucherByCode(code: string): Promise<Voucher | null> {
    const res = await query(
      `SELECT v.*, r.name as reward_name, r.description as reward_description, u.name as traveler_name
       FROM vouchers v
       JOIN rewards r ON v.reward_id = r.id
       JOIN users u ON v.user_id = u.id
       WHERE UPPER(v.code) = UPPER($1)`,
      [code.trim()]
    );
    if (!res.rows.length) return null;
    return this.mapVoucher(res.rows[0]);
  },

  async verifyAndRedeemVoucher(code: string, verifiedByUserId: string): Promise<{ success: boolean; voucher?: Voucher; error?: string }> {
    return withTransaction(async (client) => {
      const res = await client.query(
        `SELECT v.*, r.name as reward_name, r.description as reward_description
         FROM vouchers v
         JOIN rewards r ON v.reward_id = r.id
         WHERE UPPER(v.code) = UPPER($1) FOR UPDATE`,
        [code.trim()]
      );
      if (!res.rows.length) return { success: false, error: "Voucher code not found" };

      const v = res.rows[0];
      if (v.status === "redeemed") {
        return { success: false, error: `Voucher was already redeemed on ${new Date(v.redeemed_at).toLocaleString()}` };
      }
      if (v.status === "expired" || new Date(v.expires_at) < new Date()) {
        await client.query("UPDATE vouchers SET status = 'expired' WHERE id = $1", [v.id]);
        return { success: false, error: "This voucher has expired" };
      }
      if (v.status !== "active") {
        return { success: false, error: `Voucher is invalid (status: ${v.status})` };
      }

      const updated = await client.query(
        `UPDATE vouchers SET status = 'redeemed', redeemed_at = now(), redeemed_by = $1 WHERE id = $2 RETURNING *`,
        [verifiedByUserId, v.id]
      );

      // Notify the voucher owner
      await client.query(
        "INSERT INTO notifications (id, user_id, title, body, type, read, created_at) VALUES ($1, $2, $3, $4, 'voucher', false, now())",
        [newId(), v.user_id, "Voucher Claimed", `Your voucher for ${v.reward_name} was verified and claimed on site.`]
      );

      const r = updated.rows[0];
      r.reward_name = v.reward_name;
      r.reward_description = v.reward_description;

      return { success: true, voucher: this.mapVoucher(r) };
    });
  },

  async pointsHistory(userId: string) {
    const res = await query(
      "SELECT * FROM points_transactions WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      amount: Number(r.amount),
      reason: r.reason,
      createdAt: r.created_at,
    }));
  },

  async redemptions(userId?: string) {
    const qStr = userId
      ? `SELECT ur.*, r.name as reward_name, v.code as voucher_code, v.status as voucher_status
         FROM user_rewards ur
         JOIN rewards r ON ur.reward_id = r.id
         LEFT JOIN vouchers v ON ur.voucher_id = v.id
         WHERE ur.user_id = $1 ORDER BY ur.created_at DESC`
      : `SELECT ur.*, r.name as reward_name, v.code as voucher_code, v.status as voucher_status
         FROM user_rewards ur
         JOIN rewards r ON ur.reward_id = r.id
         LEFT JOIN vouchers v ON ur.voucher_id = v.id
         ORDER BY ur.created_at DESC`;
    const res = userId ? await query(qStr, [userId]) : await query(qStr);
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      rewardId: r.reward_id,
      rewardName: r.reward_name,
      voucherCode: r.voucher_code,
      voucherStatus: r.voucher_status,
      createdAt: r.created_at,
    }));
  },

  // --- Badges ---
  async badges() {
    const res = await query("SELECT * FROM badges ORDER BY name ASC");
    return res.rows;
  },

  async badgesFor(userId: string) {
    const res = await query(
      `SELECT ub.*, b.slug, b.name, b.description
       FROM user_badges ub
       JOIN badges b ON ub.badge_id = b.id
       WHERE ub.user_id = $1`,
      [userId]
    );
    return res.rows.map((r) => ({
      userId: r.user_id,
      badgeId: r.badge_id,
      earnedAt: r.earned_at,
      badge: { id: r.badge_id, slug: r.slug, name: r.name, description: r.description },
    }));
  },

  async maybeBadgesTx(client: any, user: User) {
    const award = async (slug: string) => {
      const badgeRes = await client.query("SELECT * FROM badges WHERE slug = $1", [slug]);
      if (!badgeRes.rows.length) return;
      const b = badgeRes.rows[0];

      const exists = await client.query(
        "SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_id = $2",
        [user.id, b.id]
      );
      if (exists.rows.length) return;

      await client.query(
        "INSERT INTO user_badges (user_id, badge_id, earned_at) VALUES ($1, $2, now())",
        [user.id, b.id]
      );
      await client.query(
        "INSERT INTO notifications (id, user_id, title, body, type, read, created_at) VALUES ($1, $2, $3, $4, 'badge', false, now())",
        [newId(), user.id, "Badge Unlocked!", `You earned the "${b.name}" badge. Keep exploring Tupi!`]
      );
    };

    const visitCountRes = await client.query("SELECT COUNT(*) FROM visits WHERE user_id = $1", [user.id]);
    const visits = parseInt(visitCountRes.rows[0].count, 10);
    if (visits >= 1) await award("first-adventure");
    if (visits >= 3) await award("tupi-explorer");

    const favNature = await client.query(
      `SELECT 1 FROM favorites f
       JOIN tourist_spots s ON f.spot_id = s.id
       WHERE f.user_id = $1 AND s.category_id = 'cat-nature' LIMIT 1`,
      [user.id]
    );
    if (favNature.rows.length) await award("nature-seeker");

    const reviewCount = await client.query("SELECT 1 FROM reviews WHERE user_id = $1 LIMIT 1", [user.id]);
    if (reviewCount.rows.length) await award("local-discoverer");

    if (user.points >= 300) await award("tupi-champion");
  },

  // --- Visits & Check-ins ---
  async visitsFor(userId: string) {
    const res = await query(
      "SELECT * FROM visits WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      spotId: r.spot_id,
      createdAt: r.created_at,
    }));
  },

  async checkIn(userId: string, spotId: string): Promise<{ visit: any; awarded: boolean; error?: string }> {
    return withTransaction(async (client) => {
      const spotRes = await client.query("SELECT * FROM tourist_spots WHERE id = $1", [spotId]);
      if (!spotRes.rows.length) return { visit: null, awarded: false, error: "Destination not found" };
      const spot = spotRes.rows[0];

      // Check daily duplicate
      const todayRes = await client.query(
        `SELECT * FROM visits
         WHERE user_id = $1 AND spot_id = $2 AND created_at >= CURRENT_DATE
         ORDER BY created_at DESC LIMIT 1`,
        [userId, spotId]
      );
      if (todayRes.rows.length) {
        return { visit: todayRes.rows[0], awarded: false };
      }

      const visitId = newId();
      const visitRes = await client.query(
        "INSERT INTO visits (id, user_id, spot_id, created_at) VALUES ($1, $2, $3, now()) RETURNING *",
        [visitId, userId, spotId]
      );

      // Increment spot visit count
      await client.query("UPDATE tourist_spots SET visit_count = visit_count + 1 WHERE id = $1", [spotId]);

      // Award 25 points
      const userRes = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
      const currentPts = Number(userRes.rows[0]?.points || 0);
      const newPts = currentPts + 25;
      await client.query("UPDATE users SET points = $1, updated_at = now() WHERE id = $2", [newPts, userId]);

      await client.query(
        "INSERT INTO points_transactions (id, user_id, amount, reason, created_at) VALUES ($1, $2, 25, $3, now())",
        [newId(), userId, `Visited ${spot.name}`]
      );

      await client.query(
        "INSERT INTO notifications (id, user_id, title, body, type, read, created_at) VALUES ($1, $2, 'Visit Recorded', $3, 'visit', false, now())",
        [newId(), userId, `Nice work exploring ${spot.name}! +25 eco-traveler points`]
      );

      const user = this.mapUser({ ...userRes.rows[0], points: newPts });
      await this.maybeBadgesTx(client, user);

      return { visit: visitRes.rows[0], awarded: true };
    });
  },

  // --- Notifications ---
  async notifications(userId: string): Promise<Notification[]> {
    const res = await query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      body: r.body,
      type: r.type,
      read: r.read,
      createdAt: r.created_at,
    }));
  },

  async notify(userId: string, title: string, body: string, type: string): Promise<Notification> {
    const id = newId();
    const res = await query(
      "INSERT INTO notifications (id, user_id, title, body, type, read, created_at) VALUES ($1, $2, $3, $4, $5, false, now()) RETURNING *",
      [id, userId, title, body, type]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      title: r.title,
      body: r.body,
      type: r.type,
      read: r.read,
      createdAt: r.created_at,
    };
  },

  async markRead(userId: string, id?: string): Promise<void> {
    if (id) {
      await query("UPDATE notifications SET read = true WHERE user_id = $1 AND id = $2", [userId, id]);
    } else {
      await query("UPDATE notifications SET read = true WHERE user_id = $1", [userId]);
    }
  },

  // --- Owner Verifications & Reports ---
  async ownerApps(): Promise<any[]> {
    const res = await query("SELECT * FROM owner_verifications ORDER BY created_at DESC");
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      businessName: r.business_name,
      notes: r.notes || "",
      documentUrl: r.document_url || null,
      status: r.status,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
    }));
  },

  async addOwnerApp(app: { userId: string; businessName: string; notes: string; documentUrl?: string }): Promise<any> {
    const id = newId();
    const res = await query(
      `INSERT INTO owner_verifications (id, user_id, business_name, notes, document_url, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'submitted', now())
       RETURNING *`,
      [id, app.userId, app.businessName, app.notes, app.documentUrl || null]
    );
    return res.rows[0];
  },

  async setOwnerApp(id: string, status: string): Promise<any> {
    return withTransaction(async (client) => {
      const res = await client.query(
        "UPDATE owner_verifications SET status = $1, reviewed_at = now() WHERE id = $2 RETURNING *",
        [status, id]
      );
      if (!res.rows.length) return null;
      const app = res.rows[0];

      if (status === "approved") {
        await client.query("UPDATE users SET role = 'owner', updated_at = now() WHERE id = $1", [app.user_id]);
      }

      await client.query(
        "INSERT INTO notifications (id, user_id, title, body, type, read, created_at) VALUES ($1, $2, 'Owner Application Update', $3, 'owner', false, now())",
        [newId(), app.user_id, `Your host application is now: ${status}`]
      );

      return app;
    });
  },

  async reports(): Promise<any[]> {
    const res = await query("SELECT * FROM reports ORDER BY created_at DESC");
    return res.rows;
  },

  async addReport(report: { userId?: string; targetType: string; targetId: string; reason: string }): Promise<any> {
    const id = newId();
    const res = await query(
      "INSERT INTO reports (id, user_id, target_type, target_id, reason, status, created_at) VALUES ($1, $2, $3, $4, $5, 'open', now()) RETURNING *",
      [id, report.userId || null, report.targetType, report.targetId, report.reason]
    );
    return res.rows[0];
  },

  // --- Auth Tokens ---
  async saveRefresh(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    await query(
      "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked) VALUES ($1, $2, $3, $4, false)",
      [newId(), userId, tokenHash, expiresAt]
    );
  },

  async findRefresh(tokenHash: string): Promise<any | null> {
    const res = await query(
      "SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked = false AND expires_at > now()",
      [tokenHash]
    );
    return res.rows.length ? res.rows[0] : null;
  },

  async revokeRefresh(tokenHash: string): Promise<void> {
    await query("UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1", [tokenHash]);
  },

  async saveReset(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    await query(
      "INSERT INTO password_resets (id, user_id, token_hash, expires_at, used) VALUES ($1, $2, $3, $4, false)",
      [newId(), userId, tokenHash, expiresAt]
    );
  },

  async consumeReset(tokenHash: string): Promise<any | null> {
    const res = await query(
      "UPDATE password_resets SET used = true WHERE token_hash = $1 AND used = false AND expires_at > now() RETURNING *",
      [tokenHash]
    );
    return res.rows.length ? res.rows[0] : null;
  },

  // --- Real SQL Analytics & Reporting (Feature 9) ---
  async analytics() {
    // 1. Totals
    const spotsTotal = await query("SELECT COUNT(*) FROM tourist_spots WHERE status = 'approved'");
    const pendingSpots = await query("SELECT COUNT(*) FROM tourist_spots WHERE status IN ('pending', 'under_review')");
    const touristsTotal = await query("SELECT COUNT(*) FROM users WHERE role = 'tourist'");
    const ownersTotal = await query("SELECT COUNT(*) FROM users WHERE role = 'owner'");
    const visitsTotal = await query("SELECT COUNT(*) FROM visits");
    const reviewsTotal = await query("SELECT COUNT(*) FROM reviews WHERE status = 'published'");
    const redemptionsTotal = await query("SELECT COUNT(*) FROM user_rewards");
    const vouchersActive = await query("SELECT COUNT(*) FROM vouchers WHERE status = 'active'");

    // 2. Popular & most visited spots
    const popularRes = await query(
      "SELECT id, slug, name, view_count, visit_count, category_id, barangay, estimated_entrance_fee FROM tourist_spots WHERE status = 'approved' ORDER BY view_count DESC LIMIT 8"
    );
    const mostVisitedRes = await query(
      "SELECT id, slug, name, view_count, visit_count, category_id, barangay FROM tourist_spots WHERE status = 'approved' ORDER BY visit_count DESC LIMIT 8"
    );

    // 3. Most favorited spots
    const favsRes = await query(
      `SELECT s.id, s.name, s.slug, COUNT(f.spot_id) as favs
       FROM tourist_spots s
       LEFT JOIN favorites f ON s.id = f.spot_id
       WHERE s.status = 'approved'
       GROUP BY s.id
       ORDER BY favs DESC
       LIMIT 8`
    );

    // 4. Most searched queries
    const searchRes = await query(
      "SELECT query, COUNT(*) as count FROM search_events GROUP BY query ORDER BY count DESC LIMIT 8"
    );

    // 5. Category breakdown
    const catRes = await query(
      `SELECT c.name, COUNT(s.id) as spots, COALESCE(SUM(s.view_count), 0) as views
       FROM categories c
       LEFT JOIN tourist_spots s ON c.id = s.category_id AND s.status = 'approved'
       GROUP BY c.id
       ORDER BY spots DESC`
    );

    // 6. Rating trends
    const ratingRes = await query(
      `SELECT s.name, ROUND(AVG(r.rating)::numeric, 2) as rating, COUNT(r.id) as reviews
       FROM tourist_spots s
       JOIN reviews r ON s.id = r.spot_id AND r.status = 'published'
       WHERE s.status = 'approved'
       GROUP BY s.id
       ORDER BY reviews DESC
       LIMIT 8`
    );

    // 7. Recent audit logs
    const auditRes = await query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20");

    return {
      totals: {
        spots: parseInt(spotsTotal.rows[0].count, 10),
        pendingSpots: parseInt(pendingSpots.rows[0].count, 10),
        tourists: parseInt(touristsTotal.rows[0].count, 10),
        owners: parseInt(ownersTotal.rows[0].count, 10),
        visits: parseInt(visitsTotal.rows[0].count, 10),
        reviews: parseInt(reviewsTotal.rows[0].count, 10),
        redemptions: parseInt(redemptionsTotal.rows[0].count, 10),
        activeVouchers: parseInt(vouchersActive.rows[0].count, 10),
      },
      popular: popularRes.rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        viewCount: Number(r.view_count),
        visitCount: Number(r.visit_count),
        barangay: r.barangay,
      })),
      mostVisited: mostVisitedRes.rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        visitCount: Number(r.visit_count),
        viewCount: Number(r.view_count),
        barangay: r.barangay,
      })),
      mostFavorited: favsRes.rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        favs: Number(r.favs),
      })),
      mostSearched: searchRes.rows.map((r) => ({
        query: r.query,
        count: Number(r.count),
      })),
      categories: catRes.rows.map((r) => ({
        name: r.name,
        spots: Number(r.spots),
        views: Number(r.views),
      })),
      ratingTrends: ratingRes.rows.map((r) => ({
        name: r.name,
        rating: Number(r.rating || 0),
        reviews: Number(r.reviews),
      })),
      recentActivity: auditRes.rows.map((r) => ({
        id: r.id,
        actorId: r.actor_id,
        action: r.action,
        meta: typeof r.meta === "string" ? JSON.parse(r.meta) : r.meta,
        createdAt: r.created_at,
      })),
    };
  },

  // Helper mappers
  mapUser(r: any): User {
    return {
      id: r.id,
      email: r.email,
      passwordHash: r.password_hash,
      name: r.name,
      role: r.role,
      avatarUrl: r.avatar_url || undefined,
      phone: r.phone || undefined,
      bio: r.bio || undefined,
      interests: typeof r.interests === "string" ? JSON.parse(r.interests) : r.interests || [],
      budgetPreference: r.budget_preference || undefined,
      tripStyle: r.trip_style || undefined,
      onboardingComplete: Boolean(r.onboarding_complete),
      emailVerified: Boolean(r.email_verified),
      points: Number(r.points || 0),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  mapSpot(r: any): TouristSpot {
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      categoryId: r.category_id,
      description: r.description,
      shortDescription: r.short_description,
      lat: Number(r.lat),
      lng: Number(r.lng),
      address: r.address,
      barangay: r.barangay,
      amenities: typeof r.amenities === "string" ? JSON.parse(r.amenities) : r.amenities || [],
      operatingHours: typeof r.operating_hours === "string" ? JSON.parse(r.operating_hours) : r.operating_hours || {},
      contact: r.contact || undefined,
      featured: Boolean(r.featured),
      status: r.status,
      ownerId: r.owner_id || undefined,
      dataSource: r.data_source,
      estimatedEntranceFee: r.estimated_entrance_fee !== null ? Number(r.estimated_entrance_fee) : undefined,
      popularityScore: Number(r.popularity_score || 0),
      viewCount: Number(r.view_count || 0),
      visitCount: Number(r.visit_count || 0),
      images: typeof r.images === "string" ? JSON.parse(r.images) : r.images || [],
      lastVerifiedAt: r.last_verified_at || undefined,
      verificationStatus: r.verification_status || "verified",
      verifiedBy: r.verified_by || undefined,
      safetyGuidance: typeof r.safety_guidance === "string" ? JSON.parse(r.safety_guidance) : r.safety_guidance || [],
      emergencyContact: r.emergency_contact || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  mapReview(r: any): Review {
    return {
      id: r.id,
      userId: r.user_id,
      spotId: r.spot_id,
      rating: Number(r.rating),
      body: r.body,
      photos: typeof r.photos === "string" ? JSON.parse(r.photos) : r.photos || [],
      helpfulCount: Number(r.helpful_count || 0),
      helpfulBy: typeof r.helpful_by === "string" ? JSON.parse(r.helpful_by) : r.helpful_by || [],
      ownerReply: r.owner_reply || undefined,
      status: r.status,
      createdAt: r.created_at,
    };
  },

  mapVoucher(r: any): Voucher {
    return {
      id: r.id,
      code: r.code,
      userId: r.user_id,
      rewardId: r.reward_id,
      rewardName: r.reward_name || undefined,
      rewardDescription: r.reward_description || undefined,
      status: r.status,
      expiresAt: r.expires_at,
      redeemedAt: r.redeemed_at || undefined,
      redeemedBy: r.redeemed_by || undefined,
      idempotencyKey: r.idempotency_key || undefined,
      createdAt: r.created_at,
    };
  },
};
