"use client";

import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Car,
  Clock,
  Compass,
  Crosshair,
  ExternalLink,
  Eye,
  EyeOff,
  Layers,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { toast } from "sonner";
import { api, type Spot } from "@/lib/api";
import {
  TUPI_BOUNDS,
  TUPI_CENTER,
  TUPI_POLYGON_LATLNGS,
  TUPI_MASK_POLYGON,
  isWithinTupi,
} from "@/data/tupi-boundary";

interface RoadRoute {
  distanceKm: number;
  durationMinutes: number;
  geometry: [number, number][];
  provider: "osrm" | "tupi-fallback";
}

function FitRoute({ geometry }: { geometry?: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (geometry && geometry.length > 1) {
      const bounds = L.latLngBounds(geometry);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [geometry, map]);
  return null;
}

function TupiMapController({ resetTrigger }: { resetTrigger: number }) {
  const map = useMap();

  useEffect(() => {
    // Initial fit bounds to ensure entire Tupi boundary fills screen snugly
    map.fitBounds(TUPI_BOUNDS, { padding: [20, 20] });
  }, [map]);

  useEffect(() => {
    if (resetTrigger > 0) {
      map.fitBounds(TUPI_BOUNDS, { padding: [20, 20] });
    }
  }, [resetTrigger, map]);

  return null;
}

const spotIcon = L.divIcon({
  className: "custom-leaflet-pin",
  html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#1c3d2e;border:3px solid #e2b13c;box-shadow:0 6px 16px rgba(0,0,0,0.3);color:#fff;font-size:12px;font-weight:bold;">📍</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const userIcon = L.divIcon({
  className: "custom-user-pin",
  html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#2563eb;border:3px solid #ffffff;box-shadow:0 0 0 6px rgba(37,99,235,0.3);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function Fly({ spot }: { spot: Spot | null }) {
  const map = useMap();
  if (spot) map.flyTo([spot.lat, spot.lng], 14, { duration: 1.0 });
  return null;
}

export default function MapPage() {
  const [selected, setSelected] = useState<Spot | null>(null);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("all");
  const [maskOutside, setMaskOutside] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);

  const qs = origin ? `?lat=${origin.lat}&lng=${origin.lng}` : "";
  const data = useQuery({ queryKey: ["map", qs], queryFn: () => api<{ spots: Spot[] }>(`/api/map${qs}`) });
  const cats = useQuery({ queryKey: ["cats"], queryFn: () => api<{ categories: { id: string; slug: string; name: string }[] }>("/api/categories") });

  const filteredSpots = useMemo(() => {
    let list = data.data?.spots || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.barangay.toLowerCase().includes(q));
    }
    if (selectedCat !== "all") {
      list = list.filter((s) => s.category?.slug === selectedCat);
    }
    return list;
  }, [data.data?.spots, search, selectedCat]);

  async function locate() {
    if (!navigator.geolocation) {
      setLocMsg("Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(coords);
        if (isWithinTupi(coords.lat, coords.lng)) {
          setLocMsg("Acquired current GPS coordinates in Tupi. Distances and routes are accurate.");
          toast.success("Location acquired in Tupi!");
        } else {
          setLocMsg("Your location is outside Tupi, South Cotabato. Map view remains locked to Tupi; road directions will project from Tupi center.");
          toast.info("GPS acquired outside Tupi (map view locked to Tupi).");
        }
      },
      () => {
        setLocMsg("Location access was denied. You can still browse and tap pins to view directions.");
        toast.error("Location permission denied");
      }
    );
  }

  async function calculateRoute(spot: Spot) {
    setRoutingLoading(true);
    try {
      const validOrigin = origin && isWithinTupi(origin.lat, origin.lng);
      const fromLat = validOrigin ? origin.lat : TUPI_CENTER[0];
      const fromLng = validOrigin ? origin.lng : TUPI_CENTER[1];
      const res = await api<RoadRoute>(
        `/api/routes/directions?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${spot.lat}&toLng=${spot.lng}`
      );
      setRoute(res);
      toast.success(
        res.provider.includes("OSRM")
          ? `OSRM Road Route: ${res.distanceKm} km (~${res.durationMinutes} mins)`
          : `Highland Route: ${res.distanceKm} km (~${res.durationMinutes} mins)`
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to calculate road route");
    } finally {
      setRoutingLoading(false);
    }
  }

  function launchDirections(spot: Spot) {
    const validOrigin = origin && isWithinTupi(origin.lat, origin.lng);
    const url = validOrigin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${spot.lat},${spot.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (typeof window === "undefined") return null;

  return (
    <div className="grid min-h-[calc(100vh-61px)] lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* Map Container View */}
      <div className="relative h-[48vh] lg:h-auto order-1 lg:order-1">
        <MapContainer
          center={TUPI_CENTER}
          zoom={12}
          minZoom={11}
          maxZoom={18}
          maxBounds={TUPI_BOUNDS}
          maxBoundsViscosity={1.0}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <TupiMapController resetTrigger={resetKey} />
          <Fly spot={selected} />

          {/* Dim everything outside Tupi with spotlight mask */}
          {maskOutside && (
            <Polygon
              positions={TUPI_MASK_POLYGON}
              pathOptions={{
                fillColor: "#05160d",
                fillOpacity: 0.52,
                stroke: false,
                fillRule: "evenodd",
                interactive: false,
              }}
            />
          )}

          {/* Official Tupi Municipal Boundary Line */}
          <Polygon
            positions={TUPI_POLYGON_LATLNGS}
            pathOptions={{
              color: "#15803d",
              weight: 3,
              opacity: 0.95,
              dashArray: "6, 6",
              fillColor: "#10b981",
              fillOpacity: 0.04,
            }}
          >
            <Tooltip sticky direction="top" className="font-sans text-xs font-semibold">
              Municipality of Tupi, South Cotabato Boundary
            </Tooltip>
          </Polygon>

          {origin && isWithinTupi(origin.lat, origin.lng) && (
            <Marker position={[origin.lat, origin.lng]} icon={userIcon}>
              <Popup>
                <div className="text-xs font-semibold text-blue-800">Your Current Location (in Tupi)</div>
              </Popup>
            </Marker>
          )}

          {filteredSpots.map((s) => (
            <Marker
              key={s.id}
              position={[s.lat, s.lng]}
              icon={spotIcon}
              eventHandlers={{
                click: () => setSelected(s),
              }}
            >
              <Popup>
                <div className="p-1">
                  <p className="font-serif text-sm font-bold text-forest">{s.name}</p>
                  <p className="text-[11px] text-moss">Brgy. {s.barangay}, Tupi</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {route && route.geometry && route.geometry.length > 0 && (
            <>
              <Polyline
                positions={route.geometry}
                pathOptions={{ color: "#10b981", weight: 5, opacity: 0.9 }}
              />
              <FitRoute geometry={route.geometry} />
            </>
          )}
        </MapContainer>

        {/* Floating Top-Left Territory Badge */}
        <div className="absolute left-4 top-4 z-[400] hidden sm:flex items-center gap-2 rounded-full border border-forest/15 bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-forest shadow-md backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
          </span>
          <span>Tupi, South Cotabato Territory Only</span>
        </div>

        {/* Floating Action Controls */}
        <div className="absolute right-4 top-4 z-[400] flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setMaskOutside((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-full border border-forest/15 bg-white/95 px-3 py-1.5 text-xs font-semibold text-forest shadow-md hover:bg-white transition"
            title={maskOutside ? "Hide Spotlight Mask" : "Show Spotlight Mask"}
          >
            {maskOutside ? <EyeOff size={13} className="text-forest/70" /> : <Eye size={13} className="text-emerald-700" />}
            <span className="hidden xs:inline">{maskOutside ? "Masked Outside" : "Unmasked"}</span>
          </button>

          <button
            type="button"
            onClick={() => setResetKey((k) => k + 1)}
            className="flex items-center gap-1.5 rounded-full border border-forest/15 bg-white/95 px-3 py-1.5 text-xs font-semibold text-forest shadow-md hover:bg-white transition"
            title="Reset view to entire Tupi boundary"
          >
            <Compass size={13} className="text-emerald-700" />
            <span>Reset to Tupi</span>
          </button>

          <button
            type="button"
            onClick={locate}
            className="flex items-center gap-1.5 rounded-full border border-forest/15 bg-white/95 px-3 py-1.5 text-xs font-semibold text-forest shadow-md hover:bg-white transition"
            title="Locate via GPS"
          >
            <Crosshair size={13} className="text-emerald-700" />
            <span>My GPS</span>
          </button>
        </div>
      </div>

      {/* Sidebar Exploration Panel */}
      <aside className="order-2 lg:order-2 flex flex-col justify-between border-l border-forest/10 bg-[#f7f5ef] p-5 overflow-y-auto max-h-[calc(100vh-61px)]">
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                Tupi Territory Only
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-moss">Directory</span>
            </div>
            <h1 className="font-serif text-2xl font-bold text-forest">Explore Tupi Map</h1>
            <p className="text-xs text-forest/70">
              Bounded strictly to the municipality of Tupi, South Cotabato. Explore accredited farms, scenic peaks, and fruit parks.
            </p>
          </div>

          {locMsg && <p className="text-[11px] text-moss bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">{locMsg}</p>}

          {/* Active Calculated Route Details Card */}
          {route && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/70 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                  <RouteIcon size={14} className="text-emerald-700" />
                  <span>Calculated Road Navigation</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRoute(null)}
                  className="rounded-full p-1 text-emerald-800 hover:bg-emerald-200/50"
                  aria-label="Clear Route"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-white p-2.5 border border-emerald-100 flex items-center gap-2">
                  <Navigation size={15} className="text-emerald-700" />
                  <div>
                    <span className="block text-[10px] text-forest/60">Distance</span>
                    <span className="font-bold text-forest">{route.distanceKm} km</span>
                  </div>
                </div>
                <div className="rounded-xl bg-white p-2.5 border border-emerald-100 flex items-center gap-2">
                  <Clock size={15} className="text-emerald-700" />
                  <div>
                    <span className="block text-[10px] text-forest/60">Est. Time</span>
                    <span className="font-bold text-forest">~{route.durationMinutes} mins</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-forest/70 pt-0.5">
                <span>
                  Origin: {origin && isWithinTupi(origin.lat, origin.lng) ? "Your GPS in Tupi" : "Tupi Municipal Hall"}
                </span>
                <span className="rounded-full bg-emerald-200/70 px-2 py-0.5 font-bold text-emerald-900">
                  {route.provider.includes("OSRM") ? "OSRM Real Roads" : "Highland Model"}
                </span>
              </div>
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-forest/40" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by spot name or barangay in Tupi…"
              className="w-full rounded-xl border border-forest/15 bg-white py-2 pl-9 pr-3 text-xs text-ink placeholder:text-forest/40"
            />
          </div>

          {/* Category Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
            <button
              type="button"
              onClick={() => setSelectedCat("all")}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                selectedCat === "all" ? "bg-forest text-cream" : "bg-white border border-forest/10 text-forest/70"
              }`}
            >
              All Spots
            </button>
            {cats.data?.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCat(c.slug)}
                className={`whitespace-nowrap rounded-full px-3 py-1 font-semibold transition ${
                  selectedCat === c.slug ? "bg-forest text-cream" : "bg-white border border-forest/10 text-forest/70"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Selected Destination Card Preview */}
          {selected && (
            <div className="rounded-2xl border border-gold/40 bg-white p-4 shadow-lift space-y-3">
              <div className="relative h-32 w-full overflow-hidden rounded-xl bg-forest/10">
                {selected.images?.[0]?.url && (
                  <Image src={selected.images[0].url} alt={selected.name} fill className="object-cover" />
                )}
                <div className="absolute left-2.5 top-2.5">
                  <span className="rounded-full bg-cream/95 px-2.5 py-0.5 text-[10px] font-bold text-forest">
                    {selected.category?.name || "Attraction"}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-start justify-between">
                  <h3 className="font-serif text-lg font-bold text-forest">{selected.name}</h3>
                  <span className="flex items-center gap-1 text-xs font-bold text-forest">
                    <Star size={12} className="fill-gold text-gold" /> {selected.rating.average || "New"}
                  </span>
                </div>
                <p className="text-[11px] text-moss flex items-center gap-1 mt-0.5">
                  <MapPin size={12} /> Brgy. {selected.barangay}, Tupi
                  {selected.distanceKm != null && ` · ${selected.distanceKm} km away`}
                </p>
                <p className="mt-1.5 text-xs text-forest/70 line-clamp-2">{selected.shortDescription}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => calculateRoute(selected)}
                  disabled={routingLoading}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-forest py-2 text-xs font-bold text-cream hover:bg-forest-800 transition disabled:opacity-60 shadow-sm"
                >
                  {routingLoading ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-cream border-t-transparent" />
                  ) : (
                    <RouteIcon size={13} className="text-gold" />
                  )}
                  <span>Calculate Road Route</span>
                </button>
                <button
                  type="button"
                  onClick={() => launchDirections(selected)}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-gold py-2 text-xs font-bold text-forest hover:bg-gold-600 transition shadow-sm"
                >
                  <Navigation size={13} /> External GPS
                </button>
              </div>

              <div className="pt-1 text-center">
                <Link
                  href={`/spots/${selected.slug}`}
                  className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-moss hover:underline"
                >
                  Full Destination Details <ExternalLink size={12} />
                </Link>
              </div>
            </div>
          )}

          {/* List of matching spots */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-forest/60">
              Destinations in Tupi ({filteredSpots.length})
            </span>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
              {filteredSpots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s)}
                  className={`w-full flex items-center justify-between rounded-xl p-2.5 text-left transition ${
                    selected?.id === s.id
                      ? "bg-forest text-cream shadow-sm"
                      : "bg-white hover:bg-cream border border-forest/5 text-forest"
                  }`}
                >
                  <div>
                    <span className="block font-medium text-xs">{s.name}</span>
                    <span className={`text-[10px] ${selected?.id === s.id ? "text-cream/70" : "text-moss"}`}>
                      Brgy. {s.barangay} {s.distanceKm != null ? `· ${s.distanceKm} km` : ""}
                    </span>
                  </div>
                  <Navigation size={13} className={selected?.id === s.id ? "text-gold" : "text-forest/40"} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-forest/10 pt-3 text-center text-[11px] text-forest/60">
          <p className="font-semibold text-forest/80">Municipality of Tupi · South Cotabato (9505)</p>
          <p className="text-[10px] text-forest/50">Map locked to official municipal boundary (OpenStreetMap / SOCCSKSARGEN)</p>
        </div>
      </aside>
    </div>
  );
}
