"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Check, Clock, Compass, MapPin, Navigation, Plus, Route as RouteIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api, type SavedRoute, type Spot } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function RoutesPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();

  const [selectedSpotIds, setSelectedSpotIds] = useState<string[]>(["sp-fruit-park", "sp-sg-farm"]);
  const [routeName, setRouteName] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [planResult, setPlanResult] = useState<any | null>(null);

  const spotsQuery = useQuery({
    queryKey: ["spots-all-approved"],
    queryFn: () => api<{ spots: Spot[] }>("/api/spots"),
  });

  const routesQuery = useQuery({
    queryKey: ["saved-routes"],
    queryFn: () => api<{ routes: SavedRoute[] }>("/api/routes"),
    enabled: Boolean(user),
  });

  const allSpots = spotsQuery.data?.spots || [];

  function addSpot(id: string) {
    if (selectedSpotIds.includes(id)) return;
    setSelectedSpotIds([...selectedSpotIds, id]);
  }

  function removeSpot(id: string) {
    setSelectedSpotIds(selectedSpotIds.filter((x) => x !== id));
  }

  function moveStop(index: number, direction: "up" | "down") {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= selectedSpotIds.length) return;
    const copy = [...selectedSpotIds];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    setSelectedSpotIds(copy);
  }

  async function calculateRoute(optimize = true) {
    if (selectedSpotIds.length === 0) {
      toast.error("Please select at least one tourist spot.");
      return;
    }
    setIsOptimizing(true);
    try {
      const res = await api<any>("/api/routes/plan", {
        method: "POST",
        body: JSON.stringify({
          spotIds: selectedSpotIds,
          optimize,
        }),
      });
      setPlanResult(res);
      toast.success("Multi-stop route calculated!");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsOptimizing(false);
    }
  }

  async function saveCurrentRoute() {
    if (!user) {
      toast.error("Please sign in to save custom routes.");
      return;
    }
    if (!planResult) {
      toast.error("Calculate the route before saving.");
      return;
    }
    const name = routeName.trim() || `Tupi Trail (${planResult.orderedSpots.length} stops)`;

    try {
      const stopsPayload = planResult.orderedSpots.map((s: Spot, idx: number) => ({
        spotId: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        order: idx,
      }));

      await api("/api/routes", {
        method: "POST",
        body: JSON.stringify({
          name,
          stops: stopsPayload,
          totalDistanceKm: planResult.summary.estimatedTotalKm,
          estimatedMinutes: planResult.summary.estimatedDriveMinutes,
        }),
      });
      toast.success("Route saved to your profile!");
      setRouteName("");
      routesQuery.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function deleteSaved(id: string) {
    try {
      await api(`/api/routes/${id}`, { method: "DELETE" });
      toast.success("Route removed.");
      routesQuery.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5ef] pb-24 pt-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-moss">
            <RouteIcon size={14} className="text-gold" /> Tupi Navigation Engine
          </span>
          <h1 className="mt-1 font-serif text-3xl font-bold text-forest sm:text-4xl">
            {lang === "fil" ? "Multi-Stop Planner ng Ruta" : "Multi-Stop Route Planner & Optimizer"}
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-forest/70 max-w-2xl leading-relaxed">
            {lang === "fil"
              ? "Pumili ng maraming pasyalan sa Tupi, ayusin ang pagkakasunod-sunod, at alamin ang tunay na distansya sa kalsada at tinatayang oras ng biyahe."
              : "Select multiple Tupi destinations, optimize stop sequencing with road factor compensation, and calculate realistic travel times."}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column: Spot Selector & Staging */}
          <div className="lg:col-span-1 space-y-6">
            {/* Stops in Route */}
            <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm">
              <h2 className="font-serif text-lg font-bold text-forest mb-3 flex items-center justify-between">
                <span>Selected Stops ({selectedSpotIds.length})</span>
                {selectedSpotIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedSpotIds([])}
                    className="text-[11px] text-rose-600 font-semibold hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </h2>

              {selectedSpotIds.length === 0 ? (
                <p className="text-xs text-forest/60 py-4 text-center">
                  Click on tourist spots below to add them to your itinerary route.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedSpotIds.map((id, index) => {
                    const spot = allSpots.find((s) => s.id === id);
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between rounded-xl bg-cream/60 p-2.5 text-xs border border-forest/10"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest text-[10px] font-bold text-cream">
                            {index + 1}
                          </span>
                          <span className="font-semibold text-forest truncate">{spot?.name || id}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveStop(index, "up")}
                            disabled={index === 0}
                            className="p-1 text-forest/50 hover:text-forest disabled:opacity-30"
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStop(index, "down")}
                            disabled={index === selectedSpotIds.length - 1}
                            className="p-1 text-forest/50 hover:text-forest disabled:opacity-30"
                            title="Move down"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSpot(id)}
                            className="p-1 text-rose-500 hover:text-rose-700"
                            title="Remove stop"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => calculateRoute(true)}
                  disabled={selectedSpotIds.length === 0 || isOptimizing}
                  className="w-full rounded-full bg-forest py-2.5 text-xs font-bold text-cream hover:bg-forest-800 disabled:opacity-50 transition"
                >
                  {isOptimizing ? "Optimizing Route..." : "⚡ Calculate & Optimize Route"}
                </button>
              </div>
            </div>

            {/* Destination Catalog Selector */}
            <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm">
              <h3 className="font-serif text-sm font-bold text-forest mb-3">Add Destinations</h3>
              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 text-xs">
                {allSpots.map((s) => {
                  const isAdded = selectedSpotIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => addSpot(s.id)}
                      disabled={isAdded}
                      className={`flex w-full items-center justify-between rounded-xl p-2 text-left transition ${
                        isAdded ? "bg-forest/5 text-forest/40 cursor-default" : "hover:bg-cream text-forest"
                      }`}
                    >
                      <span className="truncate pr-2 font-medium">{s.name}</span>
                      {isAdded ? <Check size={14} className="text-moss shrink-0" /> : <Plus size={14} className="shrink-0 text-forest/60" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Route Details & Map Summary */}
          <div className="lg:col-span-2 space-y-6">
            {planResult ? (
              <div className="space-y-6">
                {/* Summary Card */}
                <div className="rounded-3xl bg-forest p-6 text-cream shadow-lift">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-gold">Route Overview</span>
                      <h3 className="font-serif text-2xl font-bold mt-1">
                        {planResult.summary.totalStops} Destinations Planned
                      </h3>
                      <p className="text-xs text-cream/70 mt-1">{planResult.summary.note}</p>
                    </div>

                    <div className="flex gap-4">
                      <div className="rounded-2xl bg-white/10 px-4 py-2.5 text-center">
                        <span className="text-[10px] uppercase text-gold block">Road Distance</span>
                        <span className="text-lg font-bold font-mono">{planResult.summary.estimatedTotalKm} km</span>
                      </div>
                      <div className="rounded-2xl bg-white/10 px-4 py-2.5 text-center">
                        <span className="text-[10px] uppercase text-gold block">Est. Ride Time</span>
                        <span className="text-lg font-bold font-mono">{planResult.summary.estimatedDriveMinutes} mins</span>
                      </div>
                    </div>
                  </div>

                  {/* Save Route Form */}
                  {user && (
                    <div className="mt-6 pt-4 border-t border-cream/15 flex flex-col sm:flex-row gap-2">
                      <input
                        value={routeName}
                        onChange={(e) => setRouteName(e.target.value)}
                        placeholder="Give this route a name (e.g. Matutum Morning Run)"
                        className="flex-1 rounded-full px-4 py-2 text-xs text-ink placeholder:text-forest/40"
                      />
                      <button
                        type="button"
                        onClick={saveCurrentRoute}
                        className="rounded-full bg-gold px-5 py-2 text-xs font-bold text-forest hover:bg-yellow-400 transition"
                      >
                        Save Route
                      </button>
                    </div>
                  )}
                </div>

                {/* Ordered Legs Breakdown */}
                <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm">
                  <h4 className="font-serif text-lg font-bold text-forest mb-4">Step-by-Step Travel Sequence</h4>
                  <div className="space-y-4">
                    {planResult.legs.map((leg: any, i: number) => (
                      <div key={i} className="relative pl-6 pb-2 border-l-2 border-forest/20 last:border-l-0">
                        <span className="absolute -left-[9px] top-0 flex h-4 w-4 items-center justify-center rounded-full bg-forest text-[9px] text-cream font-bold">
                          {i + 1}
                        </span>
                        <div className="flex items-baseline justify-between text-xs">
                          <div>
                            <span className="font-bold text-forest">{leg.to}</span>
                            <span className="text-[11px] text-forest/60 block">From: {leg.from}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-moss">{leg.roadKm} km road</span>
                            <span className="text-[10px] text-forest/50 block">~{leg.estMinutes} mins</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-4 border-t border-forest/10 flex justify-end">
                    <Link
                      href="/map"
                      className="inline-flex items-center gap-1.5 rounded-full bg-forest/5 px-4 py-2 text-xs font-bold text-forest hover:bg-forest hover:text-cream transition"
                    >
                      <Navigation size={14} /> Open in Interactive GPS Map
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-forest/20 p-12 text-center bg-white/40">
                <Compass className="mx-auto text-forest/30 mb-3" size={40} />
                <h3 className="font-serif text-lg font-bold text-forest">No Route Calculated Yet</h3>
                <p className="text-xs text-forest/60 max-w-sm mx-auto mt-1">
                  Choose destinations on the left and click "Calculate & Optimize Route" to generate your travel estimates.
                </p>
              </div>
            )}

            {/* Saved User Routes Section */}
            {user && routesQuery.data?.routes && routesQuery.data.routes.length > 0 && (
              <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm">
                <h3 className="font-serif text-lg font-bold text-forest mb-3">Your Saved Custom Routes</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {routesQuery.data.routes.map((r) => (
                    <div key={r.id} className="rounded-2xl border border-forest/10 p-4 bg-cream/40 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-forest text-sm">{r.name}</h4>
                        <p className="text-xs text-moss mt-1 font-mono">
                          {r.stops?.length || 0} stops · {r.totalDistanceKm} km · ~{r.estimatedMinutes} mins
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-forest/10">
                        <button
                          type="button"
                          onClick={() => {
                            if (r.stops) {
                              setSelectedSpotIds(r.stops.map((s) => s.spotId));
                              calculateRoute(false);
                            }
                          }}
                          className="text-xs font-bold text-forest hover:underline"
                        >
                          Load Route →
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSaved(r.id)}
                          className="text-rose-600 hover:text-rose-800 p-1"
                          title="Delete route"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
