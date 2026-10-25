"use client";

import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Crosshair,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
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
  PHILIPPINES_CENTER,
  TUPI_BOUNDS,
  TUPI_CENTER,
  TUPI_POLYGON_LATLNGS,
  isWithinPhilippines,
  isWithinTupi,
} from "@/data/tupi-boundary";

interface RoadRoute {
  distanceKm: number;
  durationMinutes: number;
  geometry: [number, number][];
  provider: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  note?: string;
  mode?: "car" | "motorcycle" | "tricycle";
}

type TravelMode = "car" | "motorcycle" | "tricycle";
type MapStyle = "streets" | "satellite" | "terrain";

const TILE_LAYERS: Record<
  MapStyle,
  { name: string; url: string; attribution: string; maxZoom: number }
> = {
  streets: {
    name: "Streets",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  satellite: {
    name: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    maxZoom: 19,
  },
  terrain: {
    name: "Highland",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  },
};

const STARTING_PRESETS = [
  { id: "gps", label: "My Live GPS Location", icon: "📍", lat: null, lng: null },
  { id: "poblacion", label: "Tupi Municipal Hall (Poblacion)", icon: "🏛️", lat: 6.3347, lng: 124.9669 },
  { id: "gensan", label: "General Santos City (Bulaong)", icon: "🚌", lat: 6.1264, lng: 125.1728 },
  { id: "koronadal", label: "Koronadal City (Roundball)", icon: "🏙️", lat: 6.4974, lng: 124.8472 },
  { id: "polomolok", label: "Polomolok Town Center", icon: "🍍", lat: 6.2201, lng: 125.0644 },
];

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Number((R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))).toFixed(1));
}

function MapViewController({
  routeGeometry,
  flyTarget,
  triggerReset,
}: {
  routeGeometry?: [number, number][];
  flyTarget?: { lat: number; lng: number; zoom?: number } | null;
  triggerReset?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (routeGeometry && routeGeometry.length > 1) {
      const bounds = L.latLngBounds(routeGeometry);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  }, [routeGeometry, map]);

  useEffect(() => {
    if (flyTarget) {
      map.flyTo([flyTarget.lat, flyTarget.lng], flyTarget.zoom || 15, {
        duration: 1.1,
      });
    }
  }, [flyTarget, map]);

  useEffect(() => {
    if (triggerReset && triggerReset > 0) {
      map.flyTo(TUPI_CENTER, 13, { duration: 1.0 });
    }
  }, [triggerReset, map]);

  return null;
}

const createSpotIcon = (categorySlug?: string, isSelected?: boolean) => {
  let emoji = "📍";
  if (categorySlug?.includes("agri")) emoji = "🍍";
  else if (categorySlug?.includes("nature")) emoji = "🌿";
  else if (categorySlug?.includes("adventure")) emoji = "🧗";
  else if (
    categorySlug?.includes("culture") ||
    categorySlug?.includes("heritage")
  )
    emoji = "🏛️";

  const size = isSelected ? 34 : 28;
  const border = isSelected ? "3px solid #f59e0b" : "2px solid #ffffff";
  const bg = isSelected ? "#064e3b" : "#1c3d2e";
  const shadow = isSelected
    ? "0 0 0 4px rgba(245, 158, 11, 0.45), 0 8px 20px rgba(0,0,0,0.35)"
    : "0 4px 12px rgba(0,0,0,0.25)";

  return L.divIcon({
    className: "custom-spot-marker",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:${border};box-shadow:${shadow};font-size:${
      isSelected ? 16 : 12
    }px;color:#fff;font-weight:bold;transition:all 0.2s ease;">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const userGpsIcon = L.divIcon({
  className: "custom-user-gps-marker",
  html: `
    <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;width:28px;height:28px;border-radius:50%;background:rgba(37, 99, 235, 0.35);animation:ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.3);position:relative;z-index:2;"></div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const startPointIcon = L.divIcon({
  className: "custom-start-point-marker",
  html: `
    <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 4px 14px rgba(37,99,235,0.45);color:#ffffff;font-size:11px;font-weight:bold;">
      A
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const destinationPinIcon = L.divIcon({
  className: "custom-dest-point-marker",
  html: `
    <div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#047857;border:3px solid #f59e0b;box-shadow:0 4px 16px rgba(4,120,87,0.5);color:#ffffff;font-size:13px;font-weight:bold;">
      🏁
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export default function MapPage() {
  const [selected, setSelected] = useState<Spot | null>(null);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [originPreset, setOriginPreset] = useState("gps");
  const [locMsg, setLocMsg] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("all");
  const [mapStyle, setMapStyle] = useState<MapStyle>("streets");
  const [showBoundary, setShowBoundary] = useState(true);
  const [travelMode, setTravelMode] = useState<TravelMode>("car");
  const [showGuidanceSteps, setShowGuidanceSteps] = useState(false);

  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const qs = origin ? `?lat=${origin.lat}&lng=${origin.lng}` : "";
  const data = useQuery({
    queryKey: ["map", qs],
    queryFn: () => api<{ spots: Spot[] }>(`/api/map${qs}`),
  });
  const cats = useQuery({
    queryKey: ["cats"],
    queryFn: () =>
      api<{ categories: { id: string; slug: string; name: string }[] }>("/api/categories"),
  });

  // Calculate live distance from user origin to each spot
  const enrichedSpotsWithDistance = useMemo(() => {
    const list = (data.data?.spots || []).filter((s) => isWithinTupi(s.lat, s.lng));
    return list.map((s) => {
      let liveDist: number | null = null;
      if (origin) {
        liveDist = haversineKm(origin, s);
      }
      return {
        ...s,
        liveDistanceKm: liveDist ?? s.distanceKm ?? null,
      };
    });
  }, [data.data?.spots, origin]);

  const filteredSpots = useMemo(() => {
    let list = enrichedSpotsWithDistance;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.barangay.toLowerCase().includes(q) ||
          (s.category?.name && s.category.name.toLowerCase().includes(q))
      );
    }
    if (selectedCat !== "all") {
      list = list.filter((s) => s.category?.slug === selectedCat);
    }
    return list;
  }, [enrichedSpotsWithDistance, search, selectedCat]);

  // Request user GPS
  function locate(andRouteSpot?: Spot) {
    if (!navigator.geolocation) {
      setLocMsg("Geolocation is not supported by your browser.");
      toast.error("Geolocation is not supported.");
      return;
    }
    toast.info("Requesting your GPS location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(coords);
        setOriginPreset("gps");
        setFlyTarget({ lat: coords.lat, lng: coords.lng, zoom: 14 });

        if (isWithinTupi(coords.lat, coords.lng)) {
          setLocMsg("Live GPS acquired in Tupi, South Cotabato.");
          toast.success("GPS acquired inside Tupi!");
        } else {
          setLocMsg(
            `Live GPS acquired (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(
              4
            )}). Real route leads directly to Tupi destinations!`
          );
          toast.success("Live GPS acquired across the Philippines!");
        }

        if (andRouteSpot) {
          calculateRoute(andRouteSpot, coords, travelMode);
        }
      },
      (err) => {
        setLocMsg(
          "Location access was denied or unavailable. Using Tupi Town Center as starting point."
        );
        toast.error("GPS access denied. Pick a preset origin above.");
        if (andRouteSpot) {
          calculateRoute(andRouteSpot, { lat: TUPI_CENTER[0], lng: TUPI_CENTER[1] }, travelMode);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  // Handle changing preset origin (GPS or nearby cities)
  function handlePresetChange(presetId: string) {
    setOriginPreset(presetId);
    if (presetId === "gps") {
      locate(selected || undefined);
    } else {
      const match = STARTING_PRESETS.find((p) => p.id === presetId);
      if (match && match.lat && match.lng) {
        const coords = { lat: match.lat, lng: match.lng };
        setOrigin(coords);
        setFlyTarget({ lat: coords.lat, lng: coords.lng, zoom: 13 });
        setLocMsg(`Starting point set to ${match.label}`);
        toast.info(`Starting point: ${match.label}`);
        if (selected) {
          calculateRoute(selected, coords, travelMode);
        }
      }
    }
  }

  // Calculate real road route using backend OSRM driving engine
  async function calculateRoute(
    spot: Spot,
    overrideOrigin?: { lat: number; lng: number } | null,
    mode: TravelMode = travelMode
  ) {
    const activeOrigin =
      overrideOrigin !== undefined ? overrideOrigin : origin;

    if (!activeOrigin) {
      toast.info("Acquiring your GPS location to calculate the route…");
      locate(spot);
      return;
    }

    setRoutingLoading(true);
    try {
      const res = await api<RoadRoute>(
        `/api/routes/directions?fromLat=${activeOrigin.lat}&fromLng=${activeOrigin.lng}&toLat=${spot.lat}&toLng=${spot.lng}&mode=${mode}`
      );
      setRoute({
        ...res,
        origin: activeOrigin,
        destination: { lat: spot.lat, lng: spot.lng },
        mode,
      });

      const providerLabel = res.provider.includes("OSRM")
        ? "OSRM Road Navigation"
        : "Highland Road Projection";

      toast.success(
        `Route calculated: ${res.distanceKm} km (~${res.durationMinutes} mins) via ${providerLabel}`
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to calculate road route to destination");
    } finally {
      setRoutingLoading(false);
    }
  }

  function handleModeChange(mode: TravelMode) {
    setTravelMode(mode);
    if (selected && route) {
      calculateRoute(selected, route.origin, mode);
    }
  }

  function launchExternalDirections(spot: Spot) {
    const activeOrigin = origin || { lat: TUPI_CENTER[0], lng: TUPI_CENTER[1] };
    const url = `https://www.google.com/maps/dir/?api=1&origin=${activeOrigin.lat},${activeOrigin.lng}&destination=${spot.lat},${spot.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (typeof window === "undefined") return null;

  const currentTile = TILE_LAYERS[mapStyle];

  return (
    <div className="relative flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_440px] h-[calc(100vh-61px)] overflow-hidden bg-[#f7f5ef]">
      {/* Map Viewport Area */}
      <div className="relative flex-1 h-[52vh] lg:h-full order-1 lg:order-1">
        <MapContainer
          center={TUPI_CENTER}
          zoom={13}
          minZoom={5}
          maxZoom={19}
          className="h-full w-full bg-[#f4f2ea]"
          scrollWheelZoom
        >
          <TileLayer
            key={mapStyle}
            attribution={currentTile.attribution}
            url={currentTile.url}
            maxZoom={currentTile.maxZoom}
          />

          <MapViewController
            routeGeometry={route?.geometry}
            flyTarget={flyTarget}
            triggerReset={resetKey}
          />

          {/* Official Tupi Municipal Boundary Line Overlay */}
          {showBoundary && (
            <Polygon
              positions={TUPI_POLYGON_LATLNGS}
              pathOptions={{
                color: "#059669",
                weight: 3,
                dashArray: "6, 6",
                fillColor: "#10b981",
                fillOpacity: mapStyle === "satellite" ? 0.08 : 0.04,
              }}
            >
              <Tooltip sticky direction="top" className="font-sans text-xs font-semibold">
                Municipality of Tupi, South Cotabato
              </Tooltip>
            </Polygon>
          )}

          {/* User Starting GPS Marker */}
          {origin && (
            <Marker
              position={[origin.lat, origin.lng]}
              icon={route ? startPointIcon : userGpsIcon}
            >
              <Popup>
                <div className="p-1 text-xs">
                  <strong className="block text-blue-700">
                    {originPreset === "gps" ? "📍 Your Live GPS Location" : "Starting Location"}
                  </strong>
                  <span className="text-[11px] text-gray-600">
                    {origin.lat.toFixed(5)}, {origin.lng.toFixed(5)}
                  </span>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Destination Spots Pins */}
          {filteredSpots.map((s) => {
            const isSelected = selected?.id === s.id;
            return (
              <Marker
                key={s.id}
                position={[s.lat, s.lng]}
                icon={createSpotIcon(s.category?.slug, isSelected)}
                eventHandlers={{
                  click: () => {
                    setSelected(s);
                    setFlyTarget({ lat: s.lat, lng: s.lng, zoom: 15 });
                  },
                }}
              >
                <Popup>
                  <div className="p-1.5 space-y-1.5 min-w-[190px]">
                    <div className="flex items-center justify-between gap-1">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {s.category?.name || "Attraction"}
                      </span>
                      <span className="flex items-center gap-0.5 text-[11px] font-bold text-forest">
                        <Star size={11} className="fill-gold text-gold" /> {s.rating.average || "New"}
                      </span>
                    </div>
                    <p className="font-serif text-sm font-bold text-forest leading-snug">{s.name}</p>
                    <p className="text-[11px] text-moss">Brgy. {s.barangay}, Tupi</p>
                    {s.liveDistanceKm != null && (
                      <p className="text-[11px] font-semibold text-emerald-700">
                        📍 {s.liveDistanceKm} km from your starting point
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => calculateRoute(s)}
                      className="w-full mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-forest px-2.5 py-1.5 text-xs font-bold text-cream hover:bg-forest-800 transition"
                    >
                      <RouteIcon size={12} className="text-gold" />
                      <span>Get Road Route</span>
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Destination Goal Marker when route is active */}
          {route && selected && (
            <Marker
              position={[selected.lat, selected.lng]}
              icon={destinationPinIcon}
            >
              <Tooltip direction="top" permanent offset={[0, -18]} className="font-sans text-xs font-bold">
                🏁 {selected.name}
              </Tooltip>
            </Marker>
          )}

          {/* REAL ROAD NAVIGATION LINE ROUTE (Glowing Polyline) */}
          {route && route.geometry && route.geometry.length > 0 && (
            <>
              {/* Outer Glow Halo Layer */}
              <Polyline
                positions={route.geometry}
                pathOptions={{
                  color:
                    travelMode === "car"
                      ? "#047857"
                      : travelMode === "motorcycle"
                      ? "#d97706"
                      : "#2563eb",
                  weight: 9,
                  opacity: 0.35,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              {/* Core Vibrant Navigation Road Line */}
              <Polyline
                positions={route.geometry}
                pathOptions={{
                  color:
                    travelMode === "car"
                      ? "#10b981"
                      : travelMode === "motorcycle"
                      ? "#f59e0b"
                      : "#3b82f6",
                  weight: 5,
                  opacity: 0.95,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </>
          )}
        </MapContainer>

        {/* Floating Top-Left Region Badge */}
        <div className="absolute left-4 top-4 z-[400] hidden sm:flex items-center gap-2 rounded-full border border-forest/15 bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-forest shadow-md backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
          </span>
          <span>Whole Philippines Real Map · Tupi Destinations</span>
        </div>

        {/* Floating Top-Right View Controls Toolbar */}
        <div className="absolute right-4 top-4 z-[400] flex flex-wrap items-center gap-1.5">
          {/* Map Layer Switcher */}
          <div className="flex items-center rounded-full border border-forest/15 bg-white/95 p-0.5 shadow-md backdrop-blur">
            {(["streets", "satellite", "terrain"] as MapStyle[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setMapStyle(st)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize transition ${
                  mapStyle === st
                    ? "bg-forest text-cream shadow-sm"
                    : "text-forest/70 hover:text-forest hover:bg-cream"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Focus Tupi */}
          <button
            type="button"
            onClick={() => setResetKey((k) => k + 1)}
            className="flex items-center gap-1 rounded-full border border-forest/15 bg-white/95 px-3 py-1.5 text-xs font-semibold text-forest shadow-md hover:bg-cream transition"
            title="Focus camera on Tupi Center"
          >
            <Compass size={13} className="text-emerald-700" />
            <span className="hidden md:inline">Tupi</span>
          </button>

          {/* GPS Locate Me */}
          <button
            type="button"
            onClick={() => locate(selected || undefined)}
            className="flex items-center gap-1 rounded-full border border-forest/15 bg-white/95 px-3 py-1.5 text-xs font-semibold text-forest shadow-md hover:bg-cream transition"
            title="Get my current live GPS location"
          >
            <Crosshair size={13} className="text-blue-600" />
            <span>My GPS</span>
          </button>

          {/* Whole Philippines Overview */}
          <button
            type="button"
            onClick={() => setFlyTarget({ lat: PHILIPPINES_CENTER[0], lng: PHILIPPINES_CENTER[1], zoom: 6 })}
            className="flex items-center gap-1 rounded-full border border-forest/15 bg-white/95 px-3 py-1.5 text-xs font-semibold text-forest shadow-md hover:bg-cream transition"
            title="Zoom out to whole Philippines map"
          >
            <Globe size={13} className="text-emerald-700" />
            <span className="hidden md:inline">Philippines</span>
          </button>

          {/* Toggle Boundary Stroke */}
          <button
            type="button"
            onClick={() => setShowBoundary((v) => !v)}
            className={`p-1.5 rounded-full border border-forest/15 shadow-md transition ${
              showBoundary ? "bg-emerald-50 text-emerald-800" : "bg-white text-forest/40"
            }`}
            title="Toggle Tupi municipal boundary line"
          >
            {showBoundary ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>

        {/* FLOATING ACTIVE ROUTE HUD (WORLD-CLASS NAVIGATION CARD) */}
        {route && selected && (
          <div className="absolute left-3 right-3 bottom-4 md:left-4 md:right-auto md:w-[420px] z-[400] rounded-2xl border border-forest/15 bg-white/95 p-4 shadow-2xl backdrop-blur-md space-y-3">
            <div className="flex items-start justify-between gap-2 border-b border-forest/10 pb-2.5">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-forest">
                  <RouteIcon size={15} className="text-emerald-600" />
                  <span>Road Navigation Active</span>
                </div>
                <p className="text-[11px] text-forest/70 truncate max-w-[280px]">
                  From:{" "}
                  <strong>
                    {originPreset === "gps" ? "Your Current GPS" : STARTING_PRESETS.find((p) => p.id === originPreset)?.label}
                  </strong>{" "}
                  ➔ To: <strong>{selected.name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRoute(null)}
                className="rounded-full p-1 text-forest/50 hover:bg-forest/10 hover:text-forest transition"
                title="Dismiss Route"
              >
                <X size={16} />
              </button>
            </div>

            {/* Metrics HUD: Distance & ETA */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-forest/5 p-2.5 border border-forest/10">
                <span className="block text-[10px] uppercase font-bold text-forest/60">Distance</span>
                <span className="text-lg font-serif font-extrabold text-forest">{route.distanceKm} km</span>
              </div>
              <div className="rounded-xl bg-emerald-50 p-2.5 border border-emerald-200">
                <span className="block text-[10px] uppercase font-bold text-emerald-800">Est. Travel Time</span>
                <span className="text-lg font-serif font-extrabold text-emerald-900">
                  ~{route.durationMinutes} mins
                </span>
              </div>
            </div>

            {/* Travel Mode Switcher */}
            <div className="flex items-center justify-between gap-1 rounded-xl bg-forest/5 p-1 text-xs">
              {(
                [
                  { id: "car", label: "Car / Van", icon: Car },
                  { id: "motorcycle", label: "Motorcycle", icon: Navigation },
                  { id: "tricycle", label: "Tricycle", icon: Compass },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleModeChange(m.id)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition ${
                    travelMode === m.id
                      ? "bg-white text-forest shadow-sm"
                      : "text-forest/60 hover:text-forest"
                  }`}
                >
                  <m.icon size={12} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            {/* Turn-by-Turn Guidance Preview Toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowGuidanceSteps((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-semibold text-emerald-800 hover:text-emerald-950 py-1"
              >
                <span className="flex items-center gap-1.5">
                  <Compass size={13} />
                  <span>{showGuidanceSteps ? "Hide Turn-by-Turn Guidance" : "View Route Directions & Steps"}</span>
                </span>
                {showGuidanceSteps ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showGuidanceSteps && (
                <div className="mt-2 space-y-1.5 rounded-xl bg-cream/70 p-3 text-[11px] text-forest/80 border border-forest/10 max-h-36 overflow-y-auto scrollbar-thin">
                  <div className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                      A
                    </span>
                    <p>Depart from starting location ({originPreset === "gps" ? "Your live GPS" : "Selected origin point"}).</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-forest text-[9px] font-bold text-white">
                      ➔
                    </span>
                    <p>Navigate along Pan-Philippine Highway (AH26) corridor towards Tupi, South Cotabato.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[9px] font-bold text-white">
                      🏁
                    </span>
                    <p>
                      Arrive at destination: <strong>{selected.name}</strong>, Barangay {selected.barangay}, Tupi.
                    </p>
                  </div>
                  <p className="pt-1 text-[10px] text-forest/50 italic border-t border-forest/10">
                    Engine: {route.provider} ({route.geometry.length} route coordinates plotted).
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => launchExternalDirections(selected)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-gold py-2 text-xs font-bold text-forest hover:bg-gold-600 transition shadow-sm"
              >
                <Navigation size={13} />
                <span>Open in Google Maps / Waze</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar Exploration & Route Selection Panel */}
      <aside className="order-2 lg:order-2 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-forest/10 bg-[#f7f5ef] p-5 overflow-y-auto max-h-[48vh] lg:max-h-full">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1">
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                Real Road Navigation
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-moss">
                Tupi Explorer
              </span>
            </div>
            <h1 className="font-serif text-2xl font-bold text-forest">Explore Tupi Map</h1>
            <p className="text-xs text-forest/70">
              Interactive map of the whole Philippines with verified attractions in Tupi, South Cotabato. Select any spot to draw real road navigation from your GPS.
            </p>
          </div>

          {/* Starting Location Picker */}
          <div className="rounded-2xl border border-forest/10 bg-white p-3 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-forest/80 flex items-center gap-1">
                <Crosshair size={13} className="text-blue-600" /> Starting Location
              </label>
              {origin && (
                <span className="text-[10px] text-emerald-700 font-semibold">
                  Active ({origin.lat.toFixed(3)}, {origin.lng.toFixed(3)})
                </span>
              )}
            </div>
            <select
              value={originPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full rounded-xl border border-forest/15 bg-cream/30 p-2 text-xs font-medium text-forest focus:ring-1 focus:ring-forest focus:outline-none"
            >
              {STARTING_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.label}
                </option>
              ))}
            </select>
          </div>

          {locMsg && (
            <p className="text-[11px] text-emerald-900 bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200">
              {locMsg}
            </p>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-forest/40" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by spot name or barangay in Tupi…"
              className="w-full rounded-xl border border-forest/15 bg-white py-2 pl-9 pr-3 text-xs text-ink placeholder:text-forest/40 focus:ring-1 focus:ring-forest focus:outline-none"
            />
          </div>

          {/* Category Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
            <button
              type="button"
              onClick={() => setSelectedCat("all")}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                selectedCat === "all"
                  ? "bg-forest text-cream shadow-xs"
                  : "bg-white border border-forest/10 text-forest/70 hover:bg-cream"
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
                  selectedCat === c.slug
                    ? "bg-forest text-cream shadow-xs"
                    : "bg-white border border-forest/10 text-forest/70 hover:bg-cream"
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
                  <Image
                    src={selected.images[0].url}
                    alt={selected.name}
                    fill
                    className="object-cover"
                  />
                )}
                <div className="absolute left-2.5 top-2.5">
                  <span className="rounded-full bg-cream/95 px-2.5 py-0.5 text-[10px] font-bold text-forest shadow-xs">
                    {selected.category?.name || "Attraction"}
                  </span>
                </div>
                {selected.estimatedEntranceFee != null && (
                  <div className="absolute right-2.5 top-2.5">
                    <span className="rounded-full bg-forest/90 px-2.5 py-0.5 text-[10px] font-bold text-cream shadow-xs">
                      {selected.estimatedEntranceFee > 0
                        ? `₱${selected.estimatedEntranceFee}`
                        : "Free"}
                    </span>
                  </div>
                )}
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
                <p className="mt-1.5 text-xs text-forest/70 line-clamp-2">
                  {selected.shortDescription || selected.description}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => calculateRoute(selected)}
                  disabled={routingLoading}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-forest py-2.5 text-xs font-bold text-cream hover:bg-forest-800 transition disabled:opacity-60 shadow-sm"
                >
                  {routingLoading ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-cream border-t-transparent" />
                  ) : (
                    <RouteIcon size={14} className="text-gold" />
                  )}
                  <span>Draw Line Route</span>
                </button>

                <button
                  type="button"
                  onClick={() => launchExternalDirections(selected)}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-gold py-2.5 text-xs font-bold text-forest hover:bg-gold-600 transition shadow-sm"
                >
                  <Navigation size={13} />
                  <span>Google Maps</span>
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
              Verified Tupi Spots ({filteredSpots.length})
            </span>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
              {filteredSpots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelected(s);
                    setFlyTarget({ lat: s.lat, lng: s.lng, zoom: 15 });
                  }}
                  className={`w-full flex items-center justify-between rounded-xl p-2.5 text-left transition ${
                    selected?.id === s.id
                      ? "bg-forest text-cream shadow-sm"
                      : "bg-white hover:bg-cream border border-forest/5 text-forest"
                  }`}
                >
                  <div>
                    <span className="block font-medium text-xs">{s.name}</span>
                    <span
                      className={`text-[10px] ${
                        selected?.id === s.id ? "text-cream/70" : "text-moss"
                      }`}
                    >
                      Brgy. {s.barangay}
                      {s.liveDistanceKm != null ? ` · ${s.liveDistanceKm} km` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        selected?.id === s.id
                          ? "bg-forest-800 text-gold"
                          : "bg-forest/5 text-forest"
                      }`}
                    >
                      {s.estimatedEntranceFee ? `₱${s.estimatedEntranceFee}` : "Free"}
                    </span>
                    <Navigation
                      size={13}
                      className={selected?.id === s.id ? "text-gold" : "text-forest/40"}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-forest/10 pt-3 text-center text-[11px] text-forest/60">
          <p className="font-semibold text-forest/80">Municipality of Tupi · South Cotabato (9505)</p>
          <p className="text-[10px] text-forest/50">
            Real road navigation powered by OSRM driving engine & OpenStreetMap
          </p>
        </div>
      </aside>
    </div>
  );
}
