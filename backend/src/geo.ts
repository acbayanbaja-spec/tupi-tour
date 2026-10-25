import { spotRating, store } from "./store.js";
import type { TouristSpot } from "./types.js";

export const TUPI_BOUNDS = {
  minLat: 6.22,
  maxLat: 6.48,
  minLng: 124.85,
  maxLng: 125.13,
};

export const TUPI_CENTER = { lat: 6.3347, lng: 124.9669 };

export const TUPI_BARANGAYS = [
  "Acmonan",
  "Bololmala",
  "Bunao",
  "Cebuano",
  "Crossing Rubber",
  "Kablon",
  "Kalkam",
  "Linan",
  "Luhong",
  "Lunen",
  "Miasong",
  "Palian",
  "Poblacion",
  "Polonuling",
  "Simbo",
  "Tubo",
];

export function isWithinTupi(lat: number, lng: number): boolean {
  return (
    lat >= TUPI_BOUNDS.minLat &&
    lat <= TUPI_BOUNDS.maxLat &&
    lng >= TUPI_BOUNDS.minLng &&
    lng <= TUPI_BOUNDS.maxLng
  );
}

export function isWithinPhilippines(lat: number, lng: number): boolean {
  return lat >= 4.0 && lat <= 22.0 && lng >= 115.0 && lng <= 128.0;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export interface RoadRouteResult {
  provider: "OSRM OpenStreetMap Driving Engine" | "Rural Highland Terrain Fallback";
  distanceKm: number;
  durationMinutes: number;
  geometry: [number, number][]; // [lat, lng] array for Leaflet
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  note: string;
}

export async function fetchRoadRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RoadRouteResult> {
  const straightDist = haversineKm(origin, destination);
  const fallbackKm = Number((straightDist * 1.28).toFixed(1));
  const fallbackMins = Math.max(8, Math.round((fallbackKm / 28) * 60));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as any;
      if (data.code === "Ok" && data.routes?.[0]) {
        const route = data.routes[0];
        const rawCoords: [number, number][] = route.geometry.coordinates;
        const leafletCoords: [number, number][] = rawCoords.map(([lng, lat]) => [lat, lng]);

        return {
          provider: "OSRM OpenStreetMap Driving Engine",
          distanceKm: Number((route.distance / 1000).toFixed(1)),
          durationMinutes: Math.max(5, Math.round(route.duration / 60)),
          geometry: leafletCoords,
          origin,
          destination,
          note: "Real road route generated using OpenStreetMap road network geometry.",
        };
      }
    }
  } catch (err) {
    // Graceful fallback to terrain compensation
  }

  return {
    provider: "Rural Highland Terrain Fallback",
    distanceKm: fallbackKm,
    durationMinutes: fallbackMins,
    geometry: [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ],
    origin,
    destination,
    note: "Terrain-compensated road projection (1.28x factor for Tupi mountain foothills). Live OSRM was unreachable.",
  };
}

export async function enrichSpot(spot: TouristSpot, userId?: string, origin?: { lat: number; lng: number }) {
  const cats = await store.categories();
  const rating = await spotRating(spot.id);
  const isFav = userId ? await store.isFavorite(userId, spot.id) : false;

  return {
    ...spot,
    category: cats.find((c) => c.id === spot.categoryId) || null,
    rating: { average: rating.average, count: rating.count },
    isFavorite: isFav,
    distanceKm: origin ? Number(haversineKm(origin, spot).toFixed(2)) : null,
    etaMinutes: origin ? Math.max(8, Math.round((haversineKm(origin, spot) / 28) * 60)) : null,
  };
}

export async function enrichSpots(spots: TouristSpot[], userId?: string, origin?: { lat: number; lng: number }) {
  // Exclusively enforce Tupi, South Cotabato territorial boundaries
  const tupiSpots = spots.filter((s) => isWithinTupi(s.lat, s.lng));
  const cats = await store.categories();
  const catMap = new Map(cats.map((c) => [c.id, c]));

  let userFavs = new Set<string>();
  if (userId) {
    const favs = await store.favoritesFor(userId);
    userFavs = new Set(favs.map((f) => f.spotId));
  }

  return Promise.all(
    tupiSpots.map(async (spot) => {
      const rating = await spotRating(spot.id);
      return {
        ...spot,
        category: catMap.get(spot.categoryId) || null,
        rating: { average: rating.average, count: rating.count },
        isFavorite: userFavs.has(spot.id),
        distanceKm: origin ? Number(haversineKm(origin, spot).toFixed(2)) : null,
        etaMinutes: origin ? Math.max(8, Math.round((haversineKm(origin, spot) / 28) * 60)) : null,
      };
    })
  );
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

export function searchSpots(queryStr: string, spots: TouristSpot[]) {
  const q = queryStr.trim().toLowerCase();
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

export async function recommend(opts: {
  userId?: string;
  lat?: number;
  lng?: number;
  categoryIds?: string[];
}) {
  const allApproved = await store.spots("approved");
  const spots = allApproved.filter((s) => isWithinTupi(s.lat, s.lng));
  const origin = opts.lat != null && opts.lng != null && isWithinTupi(opts.lat, opts.lng)
    ? { lat: opts.lat, lng: opts.lng }
    : undefined;
  const favCats = new Set(opts.categoryIds || []);

  if (opts.userId) {
    const favs = await store.favoritesFor(opts.userId);
    for (const f of favs) {
      const spot = await store.getSpot(f.spotId);
      if (spot && isWithinTupi(spot.lat, spot.lng)) favCats.add(spot.categoryId);
    }
    const user = await store.findUserById(opts.userId);
    if (user?.interests) {
      const allCats = await store.categories();
      for (const slug of user.interests) {
        const cat = allCats.find((c) => c.slug === slug || c.id === slug);
        if (cat) favCats.add(cat.id);
      }
    }
  }

  const visits = opts.userId ? await store.visitsFor(opts.userId) : [];
  const visited = new Set(visits.map((v) => v.spotId));

  const scored = await Promise.all(
    spots.map(async (s) => {
      let score = s.popularityScore;
      const rating = await spotRating(s.id);
      score += rating.average * 8;
      if (favCats.has(s.categoryId)) score += 18;
      if (visited.has(s.id)) score -= 25;
      if (origin) {
        const km = haversineKm(origin, s);
        score += Math.max(0, 20 - km);
      }
      if (s.featured) score += 6;
      return { s, score };
    })
  );

  scored.sort((a, b) => b.score - a.score);
  const allCategories = await store.categories();
  const because = favCats.size
    ? "Because you like " +
      [...favCats]
        .map((id) => allCategories.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(", ")
    : "Popular in Tupi";

  const enrichedItems = await Promise.all(
    scored.slice(0, 8).map(async (x, i) => ({
      reason: i < 3 && origin ? "Popular near you" : x.s.featured ? "Highly rated destinations" : because,
      spot: await enrichSpot(x.s, opts.userId, origin),
    }))
  );

  return { because, items: enrichedItems };
}
