"use client";

import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Compass,
  Crosshair,
  ExternalLink,
  Layers,
  MapPin,
  Navigation,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { toast } from "sonner";
import { api, type Spot } from "@/lib/api";

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

  const qs = origin ? `?lat=${origin.lat}&lng=${origin.lng}` : "";
  const data = useQuery({ queryKey: ["map", qs], queryFn: () => api<{ spots: Spot[] }>(`/api/map${qs}`) });
  const cats = useQuery({ queryKey: ["cats"], queryFn: () => api<{ categories: { id: string; slug: string; name: string }[] }>("/api/categories") });

  const center = useMemo<[number, number]>(() => [6.3347, 124.9669], []);

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
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocMsg("Acquired current GPS coordinates. Distances are calculated accurately.");
        toast.success("Location acquired!");
      },
      () => {
        setLocMsg("Location access was denied. You can still browse and tap pins to view directions.");
        toast.error("Location permission denied");
      }
    );
  }

  function launchDirections(spot: Spot) {
    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${spot.lat},${spot.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (typeof window === "undefined") return null;

  return (
    <div className="grid min-h-[calc(100vh-61px)] lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* Map Container View */}
      <div className="relative h-[48vh] lg:h-auto order-1 lg:order-1">
        <MapContainer center={center} zoom={12} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Fly spot={selected} />

          {origin && (
            <Marker position={[origin.lat, origin.lng]} icon={userIcon}>
              <Popup>
                <div className="text-xs font-semibold text-blue-800">Your Current Location</div>
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
                  <p className="text-[11px] text-moss">Brgy. {s.barangay}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Floating Quick Locate Button */}
        <button
          type="button"
          onClick={locate}
          className="absolute right-4 top-4 z-[400] flex items-center gap-1.5 rounded-full border border-forest/15 bg-white/95 px-4 py-2 text-xs font-semibold text-forest shadow-md hover:bg-white"
        >
          <Crosshair size={14} className="text-emerald-700" />
          <span>My GPS Location</span>
        </button>
      </div>

      {/* Sidebar Exploration Panel */}
      <aside className="order-2 lg:order-2 flex flex-col justify-between border-l border-forest/10 bg-[#f7f5ef] p-5 overflow-y-auto max-h-[calc(100vh-61px)]">
        <div className="space-y-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-moss">Geographic Directory</span>
            <h1 className="font-serif text-2xl font-bold text-forest">Explore Tupi Map</h1>
            <p className="text-xs text-forest/70">
              Interactive map pins for accredited farms, scenic peaks, and fruit parks.
            </p>
          </div>

          {locMsg && <p className="text-[11px] text-moss bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">{locMsg}</p>}

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-forest/40" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by spot name or barangay…"
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
                  <MapPin size={12} /> Brgy. {selected.barangay}
                  {selected.distanceKm != null && ` · ${selected.distanceKm} km away`}
                </p>
                <p className="mt-1.5 text-xs text-forest/70 line-clamp-2">{selected.shortDescription}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => launchDirections(selected)}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-gold py-2 text-xs font-bold text-forest hover:bg-gold-600 transition"
                >
                  <Navigation size={13} /> Open Directions
                </button>
                <Link
                  href={`/spots/${selected.slug}`}
                  className="flex items-center justify-center gap-1 rounded-full border border-forest/20 bg-cream/60 py-2 text-xs font-semibold text-forest hover:bg-cream"
                >
                  Full Details <ExternalLink size={12} />
                </Link>
              </div>
            </div>
          )}

          {/* List of matching spots */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-forest/60">
              Matching Destinations ({filteredSpots.length})
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

        <div className="mt-4 border-t border-forest/10 pt-3 text-center text-[11px] text-forest/50">
          OpenStreetMap & GPS Navigation fallback enabled
        </div>
      </aside>
    </div>
  );
}
