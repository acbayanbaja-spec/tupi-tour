import { store } from "./store.js";
import type { TouristSpot } from "./types.js";

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function enrichSpot(spot: TouristSpot, userId?: string, origin?: { lat: number; lng: number }) {
  const cats = store.categories();
  const rating = store.snapshot().reviews.filter((r) => r.spotId === spot.id && r.status === "published");
  const avg = rating.length ? rating.reduce((s, r) => s + r.rating, 0) / rating.length : 0;
  return {
    ...spot,
    category: cats.find((c) => c.id === spot.categoryId) || null,
    rating: { average: Number(avg.toFixed(2)), count: rating.length },
    favoriteCount: store.snapshot().favorites.filter((f) => f.spotId === spot.id).length,
    isFavorite: userId ? store.isFavorite(userId, spot.id) : false,
    distanceKm: origin ? Number(haversineKm(origin, spot).toFixed(2)) : null,
    etaMinutes: origin ? Math.max(8, Math.round((haversineKm(origin, spot) / 28) * 60)) : null,
  };
}

function levenshtein(a: string, b: string) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i][j] = Math.min(
        m[i - 1][j] + 1,
        m[i][j - 1] + 1,
        m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return m[a.length][b.length];
}

export function searchSpots(query: string, spots: TouristSpot[]) {
  const q = query.trim().toLowerCase();
  if (!q) return spots;
  return spots
    .map((s) => {
      const hay = `${s.name} ${s.barangay} ${s.address} ${s.shortDescription}`.toLowerCase();
      let score = 0;
      if (hay.includes(q)) score += 10;
      hay.split(/\s+/).forEach((word) => {
        if (word.startsWith(q)) score += 6;
        if (levenshtein(word.slice(0, q.length), q) <= 1 && q.length > 2) score += 3;
      });
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
}

export function recommend(opts: {
  userId?: string;
  lat?: number;
  lng?: number;
  categoryIds?: string[];
}) {
  const spots = store.spots("approved");
  const origin = opts.lat != null && opts.lng != null ? { lat: opts.lat, lng: opts.lng } : undefined;
  const favCats = new Set(opts.categoryIds || []);
  if (opts.userId) {
    store.favoritesFor(opts.userId).forEach((f) => {
      const spot = store.getSpot(f.spotId);
      if (spot) favCats.add(spot.categoryId);
    });
    const user = store.findUserById(opts.userId);
    user?.interests.forEach((slug) => {
      const cat = store.categories().find((c) => c.slug === slug || c.id === slug);
      if (cat) favCats.add(cat.id);
    });
  }
  const visited = new Set(opts.userId ? store.visitsFor(opts.userId).map((v) => v.spotId) : []);
  const scored = spots.map((s) => {
    let score = s.popularityScore;
    const reviews = store.reviewsForSpot(s.id);
    const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 4;
    score += avg * 8;
    if (favCats.has(s.categoryId)) score += 18;
    if (visited.has(s.id)) score -= 25;
    if (origin) {
      const km = haversineKm(origin, s);
      score += Math.max(0, 20 - km);
    }
    if (s.featured) score += 6;
    return { s, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const because = favCats.size
    ? "Because you like " +
      [...favCats]
        .map((id) => store.categories().find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(", ")
    : "Popular in Tupi";
  return {
    because,
    items: scored.slice(0, 8).map((x, i) => ({
      reason: i < 3 && origin ? "Popular near you" : x.s.featured ? "Highly rated destinations" : because,
      spot: enrichSpot(x.s, opts.userId, origin),
    })),
  };
}
