"use client";

import { useQuery } from "@tanstack/react-query";
import { Crosshair, MapPin, Navigation, Sparkles, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { Stagger } from "@/components/motion";
import { SpotCard, SpotSkeleton } from "@/components/spot-card";
import { api, type Spot } from "@/lib/api";
import { isWithinTupi, TUPI_CENTER } from "@/data/tupi-boundary";

const RADIUS_OPTIONS = [
  { label: "5 km", value: 5 },
  { label: "10 km", value: 10 },
  { label: "20 km", value: 20 },
  { label: "All of Tupi", value: 100 },
];

function ExploreInner() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [sort, setSort] = useState("popular");

  // Feature 3: Nearby GPS Proximity Discovery
  const [gpsOrigin, setGpsOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(20);
  const [locating, setLocating] = useState(false);

  const cats = useQuery({
    queryKey: ["cats"],
    queryFn: () => api<{ categories: { id: string; slug: string; name: string }[] }>("/api/categories"),
  });

  const query = useMemo(() => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (category) s.set("category", category);
    s.set("sort", sort);
    return s.toString();
  }, [q, category, sort]);

  // Standard query when GPS is inactive
  const regularSpots = useQuery({
    queryKey: ["spots", query],
    queryFn: () => api<{ spots: Spot[] }>(`/api/spots?${query}`),
    enabled: !gpsOrigin,
  });

  // Nearby discovery query when GPS is active
  const nearbySpots = useQuery({
    queryKey: ["spots-nearby", gpsOrigin?.lat, gpsOrigin?.lng, radiusKm, category],
    queryFn: () => {
      const qs = new URLSearchParams();
      qs.set("lat", String(gpsOrigin!.lat));
      qs.set("lng", String(gpsOrigin!.lng));
      qs.set("radiusKm", String(radiusKm));
      if (category) qs.set("categoryId", category);
      return api<{ origin: { lat: number; lng: number }; radiusKm: number; count: number; spots: Spot[] }>(
        `/api/spots/nearby?${qs.toString()}`
      );
    },
    enabled: Boolean(gpsOrigin),
  });

  function triggerGps() {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success("GPS Location acquired! Showing nearby destinations.");
      },
      (err) => {
        setLocating(false);
        setGpsOrigin({ lat: TUPI_CENTER[0], lng: TUPI_CENTER[1] });
        toast.warning("Couldn't read your GPS. Showing destinations near Tupi center instead.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function clearGps() {
    setGpsOrigin(null);
    toast.info("Cleared GPS filter.");
  }

  const isLoading = gpsOrigin ? nearbySpots.isLoading : regularSpots.isLoading;
  const rawSpots = gpsOrigin ? nearbySpots.data?.spots || [] : regularSpots.data?.spots || [];

  // Filter spots by search query if user types in search box during nearby mode
  const displayedSpots = useMemo(() => {
    const tupiOnly = rawSpots.filter((s) => isWithinTupi(s.lat, s.lng));
    if (!q.trim()) return tupiOnly;
    const term = q.toLowerCase();
    return tupiOnly.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.barangay.toLowerCase().includes(term) ||
        s.shortDescription.toLowerCase().includes(term)
    );
  }, [rawSpots, q]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-moss">South Cotabato Tourism</span>
          <h1 className="mt-1 font-serif text-4xl font-bold text-forest sm:text-5xl">Explore Tupi</h1>
          <p className="mt-2 text-forest/70">
            Search, discover nearby agro-tourism spots, or filter accredited destinations by barangay and category.
          </p>
        </div>

        {/* GPS Quick Action */}
        <button
          type="button"
          onClick={gpsOrigin ? clearGps : triggerGps}
          disabled={locating}
          className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition shadow-sm ${
            gpsOrigin
              ? "bg-rose-100 text-rose-800 hover:bg-rose-200"
              : "bg-forest text-cream hover:bg-forest-800"
          }`}
        >
          {locating ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream border-t-transparent" />
          ) : gpsOrigin ? (
            <X size={14} />
          ) : (
            <Crosshair size={14} className="text-gold" />
          )}
          <span>{gpsOrigin ? "Turn Off GPS Discovery" : "Near Me (GPS Proximity)"}</span>
        </button>
      </div>

      {/* Nearby Active Notification & Radius Filters */}
      {gpsOrigin && (
        <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-50/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Navigation className="text-emerald-700 shrink-0" size={18} />
              <div>
                <p className="text-xs font-bold text-emerald-950">
                  Proximity Discovery Active: {displayedSpots.length} Destination{displayedSpots.length === 1 ? "" : "s"} within {radiusKm} km
                </p>
                <p className="text-[11px] text-emerald-800/80">
                  Sorted by actual haversine distance from your current position ({gpsOrigin.lat.toFixed(4)}, {gpsOrigin.lng.toFixed(4)}).
                </p>
              </div>
            </div>

            {/* Radius Selector Chips */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] font-semibold text-emerald-900 mr-1">Radius:</span>
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRadiusKm(opt.value)}
                  className={`rounded-full px-3 py-1 font-semibold transition text-xs ${
                    radiusKm === opt.value
                      ? "bg-forest text-cream shadow-sm"
                      : "bg-white text-forest border border-emerald-200 hover:bg-emerald-100/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search & Category Filter Controls */}
      <div className="mt-6 flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search destinations or barangay…"
          className="rounded-full border border-forest/15 bg-white px-4 py-2 text-xs font-medium text-forest placeholder:text-forest/40 focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-full border border-forest/15 bg-white px-4 py-2 text-xs font-medium text-forest focus:outline-none focus:ring-2 focus:ring-forest/30"
        >
          <option value="">All categories</option>
          {cats.data?.categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        {!gpsOrigin && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-full border border-forest/15 bg-white px-4 py-2 text-xs font-medium text-forest focus:outline-none focus:ring-2 focus:ring-forest/30"
          >
            <option value="popular">Popularity</option>
            <option value="rating">Ratings</option>
            <option value="name">Name</option>
          </select>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <SpotSkeleton key={n} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !displayedSpots.length && (
        <div className="mt-16 rounded-3xl border border-forest/10 bg-white p-12 text-center shadow-sm">
          <MapPin className="mx-auto text-forest/30 mb-3" size={40} />
          <p className="font-serif text-2xl font-bold text-forest">No destinations found.</p>
          <p className="mt-2 text-xs text-forest/70">
            {gpsOrigin
              ? `No spots found within ${radiusKm} km. Try expanding your radius filter or clear search terms.`
              : "Try searching for 'Fruit Park', 'SG Farm', or select 'All categories'."}
          </p>
        </div>
      )}

      {/* Grid of Destination Cards */}
      <Stagger className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {displayedSpots.map((s) => (
          <SpotCard
            key={s.id}
            spot={s}
            onFav={() => {
              if (gpsOrigin) nearbySpots.refetch();
              else regularSpots.refetch();
            }}
          />
        ))}
      </Stagger>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreInner />
    </Suspense>
  );
}
