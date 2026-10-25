"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bike,
  Bookmark,
  Calendar,
  Car,
  Check,
  Clock,
  Coins,
  Compass,
  ExternalLink,
  Footprints,
  MapPin,
  Plus,
  Route,
  Share2,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { FadeIn } from "@/components/motion";
import { api, type Spot } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Itinerary = {
  title: string;
  hours?: number;
  targetMinutes?: number;
  actualElapsedMinutes?: number;
  startTime?: string;
  endTime?: string;
  destinationsCount?: number;
  assumptions: string[];
  schedule: { time: string; title: string; kind: "spot" | "break" | "return"; minutes: number; note: string; spot?: Spot }[];
  alternatives: Spot[];
  budget: {
    estimated: boolean;
    transportation: number;
    food: number;
    entranceFees: number;
    other: number;
    total: number;
    withinBudget: boolean;
    remainingBudget?: number;
    deficit?: number;
    suggestions?: string[];
    note: string;
  };
  aiNotes: string;
};

const TRANSPORT_OPTIONS = [
  { id: "tricycle", label: "Tricycle", desc: "Best for Poblacion to Kablon", icon: Bike },
  { id: "motorcycle", label: "Motorcycle / Habal", desc: "Fast highland mountain trails", icon: Bike },
  { id: "car", label: "Private Car / Van", desc: "Comfortable for groups & family", icon: Car },
  { id: "jeepney", label: "Jeepney", desc: "Budget highway route", icon: Car },
];

const INTENSITY_OPTIONS = [
  { id: "easy", label: "Relaxed", desc: "Leisurely cafe & flower viewing", icon: CoffeeIcon },
  { id: "moderate", label: "Balanced", desc: "Farms, viewpoints & fruit stops", icon: Compass },
  { id: "active", label: "Active", desc: "Early treks, multiple stops", icon: Footprints },
];

function CoffeeIcon(props: { size?: number; className?: string }) {
  return <Footprints {...props} />;
}

function parseMinutes(t: string): number {
  const parts = t.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function minutesToTimeString(minutes: number): string {
  const total = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatTimeBadge(t: string): string {
  const parts = t.split(":");
  let h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${displayH} ${period}` : `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

const COMMON_TIME_PRESETS = [
  { label: "1:00 PM – 5:00 PM (4 hrs Afternoon)", start: "13:00", end: "17:00", hours: 4 },
  { label: "1:00 PM – 6:00 PM (5 hrs Sunset)", start: "13:00", end: "18:00", hours: 5 },
  { label: "1:00 PM – 4:00 PM (3 hrs Express)", start: "13:00", end: "16:00", hours: 3 },
  { label: "9:00 AM – 3:00 PM (6 hrs Day)", start: "09:00", end: "15:00", hours: 6 },
  { label: "8:00 AM – 1:00 PM (5 hrs Morning)", start: "08:00", end: "13:00", hours: 5 },
  { label: "8:00 AM – 12:00 PM (4 hrs Morning)", start: "08:00", end: "12:00", hours: 4 },
  { label: "8:00 AM – 4:00 PM (8 hrs Full Day)", start: "08:00", end: "16:00", hours: 8 },
];

const POPULAR_DEPARTURE_TIMES = [
  { label: "1:00 PM ★", desc: "1pm Afternoon Tour", value: "13:00" },
  { label: "8:00 AM", desc: "Early Morning", value: "08:00" },
  { label: "9:00 AM", desc: "Morning Tour", value: "09:00" },
  { label: "10:00 AM", desc: "Mid-Morning", value: "10:00" },
  { label: "1:30 PM", desc: "Afternoon", value: "13:30" },
  { label: "2:00 PM", desc: "Afternoon", value: "14:00" },
];

export default function PlannerPage() {
  const { user } = useAuth();
  const cats = useQuery({ queryKey: ["cats"], queryFn: () => api<{ categories: { slug: string; name: string }[] }>("/api/categories") });
  const allSpotsQuery = useQuery({ queryKey: ["spots-for-planner"], queryFn: () => api<{ spots: Spot[] }>("/api/spots") });

  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("15:00");
  const [customHours, setCustomHours] = useState(6);
  const [budget, setBudget] = useState(1000);
  const [travelers, setTravelers] = useState(2);
  const [transport, setTransport] = useState<"tricycle" | "motorcycle" | "car" | "jeepney">("tricycle");
  const [intensity, setIntensity] = useState<"easy" | "moderate" | "active">("moderate");
  const [interests, setInterests] = useState<string[]>(["agri-tourism", "nature"]);
  const [mustVisitSpotIds, setMustVisitSpotIds] = useState<string[]>([]);
  const [selectedSpotToAdd, setSelectedSpotToAdd] = useState("");
  const [plan, setPlan] = useState<Itinerary | null>(null);
  const [busy, setBusy] = useState(false);

  const startMin = parseMinutes(startTime);
  const endMin = parseMinutes(endTime);
  const durationMinutes = endMin > startMin ? endMin - startMin : 0;
  const durationHours = +(durationMinutes / 60).toFixed(1);

  const approvedSpots = allSpotsQuery.data?.spots || [];

  function handleDurationChange(newHours: number) {
    const valid = Math.max(1, Math.min(14, newHours));
    setCustomHours(valid);
    const newEndMin = Math.min(23 * 60 + 59, startMin + Math.round(valid * 60));
    setEndTime(minutesToTimeString(newEndMin));
  }

  function handleStartTimeChange(newStart: string) {
    setStartTime(newStart);
    const sMin = parseMinutes(newStart);
    const newEndMin = Math.min(23 * 60 + 59, sMin + Math.round(customHours * 60));
    setEndTime(minutesToTimeString(newEndMin));
  }

  function handleEndTimeChange(newEnd: string) {
    setEndTime(newEnd);
    const eMin = parseMinutes(newEnd);
    if (eMin > startMin) {
      const diffH = +((eMin - startMin) / 60).toFixed(1);
      setCustomHours(diffH);
    }
  }

  function toggleInterest(slug: string) {
    setInterests((c) => (c.includes(slug) ? c.filter((x) => x !== slug) : [...c, slug]));
  }

  function toggleMustVisit(id: string) {
    setMustVisitSpotIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function fetchItineraryWithStops(overrideSpotIds?: string[]) {
    if (endMin <= startMin) {
      toast.error("End time must be later than start time.");
      return;
    }
    if (durationMinutes < 120) {
      toast.error("Please allow at least 2 hours for a meaningful Tupi tour.");
      return;
    }

    setBusy(true);
    try {
      const activeMustVisits = overrideSpotIds ?? mustVisitSpotIds;
      const data = await api<{ itinerary: Itinerary }>("/api/itinerary", {
        method: "POST",
        body: JSON.stringify({
          startTime,
          endTime,
          hours: customHours,
          budget,
          travelers,
          transport,
          intensity,
          interests,
          mustVisitSpotIds: activeMustVisits,
        }),
      });
      setPlan(data.itinerary);
      toast.success("AI generated your custom Tupi itinerary!");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await fetchItineraryWithStops();
  }

  // Allow tourist to dynamically add an alternative stop into their live route
  async function addStopToRoute(spotId: string) {
    if (mustVisitSpotIds.includes(spotId)) {
      toast.info("Destination is already in your route.");
      return;
    }
    const updated = [...mustVisitSpotIds, spotId];
    setMustVisitSpotIds(updated);
    toast.info("Adding destination to route and recalibrating schedule…");
    await fetchItineraryWithStops(updated);
  }

  // Allow tourist to remove a stop from their live route
  async function removeStopFromRoute(spotId: string) {
    const updated = mustVisitSpotIds.filter((id) => id !== spotId);
    setMustVisitSpotIds(updated);
    toast.info("Removing stop and recalculating schedule…");
    await fetchItineraryWithStops(updated);
  }

  async function saveTrip() {
    if (!user) return toast.error("Please sign in to save this trip to your profile.");
    if (!plan) return;
    try {
      const spotIds = plan.schedule.filter((b) => b.spot).map((b) => b.spot!.id);
      await api("/api/trips", {
        method: "POST",
        body: JSON.stringify({ name: plan.title, notes: plan.aiNotes, spotIds }),
      });
      toast.success("Saved to My Trips!");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5ef] pb-24">
      {/* Header */}
      <div className="border-b border-forest/10 bg-white/70 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-gold/20 px-3 py-1 text-xs font-bold text-forest">
            <Sparkles size={14} className="text-gold" /> Intelligent Travel Engine
          </div>
          <h1 className="mt-3 font-serif text-3xl font-bold text-forest sm:text-5xl">
            AI Tupi Trip Planner
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-forest/70">
            Set your exact time duration, customize your departure and return, pick must-visit spots, and add more routes as you like. Every itinerary is calibrated strictly to what you afford and fit in time.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
        {/* Form Container */}
        <form onSubmit={onSubmit} className="rounded-3xl border border-forest/10 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          {/* Section 1: Duration & Timing */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-forest/80">
                1. Set Your Time Duration & Schedule
              </span>
              <span className="text-[11px] font-semibold text-moss">
                Calibrated to what you want (2h to 14h)
              </span>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-2 mb-4">
              {COMMON_TIME_PRESETS.map((preset) => {
                const active = startTime === preset.start && endTime === preset.end;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setStartTime(preset.start);
                      setEndTime(preset.end);
                      setCustomHours(preset.hours);
                    }}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-forest text-cream ring-2 ring-forest/30"
                        : "border border-forest/15 bg-cream/50 text-forest hover:bg-cream"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Time Controls: Duration Slider/Number, Start Time, End Time */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 rounded-2xl bg-cream/30 p-4 border border-forest/10">
              {/* Duration in Hours (Custom Duration Tourist Wants) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                  Total Duration (Hours)
                </label>
                <div className="relative mt-1.5">
                  <Clock className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={16} />
                  <input
                    type="number"
                    min={2}
                    max={14}
                    step={0.5}
                    value={customHours}
                    onChange={(e) => handleDurationChange(Number(e.target.value))}
                    className="w-full rounded-xl border border-forest/15 px-3.5 py-2.5 pl-10 text-sm font-semibold"
                  />
                </div>
                <div className="mt-1.5 flex gap-1">
                  {[3, 4, 5, 6, 8].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleDurationChange(h)}
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        customHours === h ? "bg-forest text-cream" : "bg-white text-forest/70 border border-forest/10 hover:bg-cream"
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Time / Departure Time */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                  Departure Time
                </label>
                <div className="relative mt-1.5">
                  <Clock className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={16} />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                    className="w-full rounded-xl border border-forest/15 px-3.5 py-2.5 pl-10 text-sm font-semibold"
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {POPULAR_DEPARTURE_TIMES.map((chip) => {
                    const isSelected = startTime === chip.value;
                    return (
                      <button
                        key={chip.value}
                        type="button"
                        onClick={() => handleStartTimeChange(chip.value)}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                          isSelected
                            ? "bg-forest text-cream ring-1 ring-forest"
                            : "bg-white text-forest/80 border border-forest/10 hover:bg-cream"
                        }`}
                        title={`Set departure to ${chip.desc}`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
                <span className="mt-1 block text-[11px] text-forest/60">
                  Starts at <strong className="text-forest">{formatTimeBadge(startTime)}</strong>
                  {startMin >= 12 * 60 && (
                    <span className="ml-1 text-amber-700 font-semibold">(Afternoon Tour)</span>
                  )}
                </span>
              </div>

              {/* End Time / Return Time */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                  Return Time
                </label>
                <div className="relative mt-1.5">
                  <Clock className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={16} />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => handleEndTimeChange(e.target.value)}
                    className="w-full rounded-xl border border-forest/15 px-3.5 py-2.5 pl-10 text-sm font-semibold"
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {[3, 4, 5, 6].map((h) => {
                    const targetEndMin = Math.min(23 * 60 + 59, startMin + h * 60);
                    const targetEndStr = minutesToTimeString(targetEndMin);
                    const isSelected = endTime === targetEndStr;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => handleEndTimeChange(targetEndStr)}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                          isSelected
                            ? "bg-forest text-cream ring-1 ring-forest"
                            : "bg-white text-forest/80 border border-forest/10 hover:bg-cream"
                        }`}
                        title={`Return after ${h} hours`}
                      >
                        {formatTimeBadge(targetEndStr)}
                      </button>
                    );
                  })}
                </div>
                <span className="mt-1 block text-[11px] text-forest/60">
                  Returns by <strong className="text-forest">{formatTimeBadge(endTime)}</strong>
                </span>
              </div>

              {/* Group Size */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                  Travelers
                </label>
                <div className="relative mt-1.5">
                  <Users className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={16} />
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={travelers}
                    onChange={(e) => setTravelers(Number(e.target.value))}
                    className="w-full rounded-xl border border-forest/15 px-3.5 py-2.5 pl-10 text-sm font-semibold"
                  />
                </div>
                <span className="mt-1 block text-[11px] text-forest/60">Number of people</span>
              </div>
            </div>

            {/* Live Timing Status Banner */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream/70 px-4 py-2.5 text-xs text-forest">
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-forest/70" />
                <span>
                  Schedule Window: <strong className="font-semibold">{formatTimeBadge(startTime)} – {formatTimeBadge(endTime)}</strong> ({customHours} hrs total)
                </span>
              </div>
              {startMin >= 12 * 60 ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                  ☀️ Afternoon Tour · Merienda & fruit shake break included
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  🌿 Morning / Day Tour · Mountain breeze & sightseeing
                </span>
              )}
            </div>
          </div>

          {/* Section 2: Budget & Transport */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                2. Total Budget (₱)
              </label>
              <div className="relative mt-1.5">
                <Coins className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={16} />
                <input
                  type="number"
                  min={200}
                  step={100}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="w-full rounded-xl border border-forest/15 px-3.5 py-2.5 pl-10 text-sm font-semibold"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[800, 1000, 1500, 2000, 3000].map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBudget(b)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                      budget === b ? "bg-forest text-cream" : "bg-cream/80 text-forest/80 hover:bg-cream"
                    }`}
                  >
                    ₱{b.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode of Transport */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80 mb-1.5">
                Mode of Transport
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TRANSPORT_OPTIONS.map((t) => {
                  const Icon = t.icon;
                  const active = transport === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTransport(t.id as typeof transport)}
                      className={`flex items-center gap-2 rounded-xl border p-2 text-left transition ${
                        active
                          ? "border-forest bg-forest text-cream ring-1 ring-forest/20"
                          : "border-forest/15 bg-white text-forest hover:bg-cream/50"
                      }`}
                    >
                      <Icon size={16} className={active ? "text-gold" : "text-moss"} />
                      <span className="text-xs font-bold">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 3: Add More Routes / Select Must-Visit Stops */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                3. Add Specific Routes & Must-Visit Stops (Optional)
              </label>
              <span className="text-[11px] text-forest/60">
                {mustVisitSpotIds.length} place{mustVisitSpotIds.length !== 1 ? "s" : ""} selected to include
              </span>
            </div>
            <p className="text-xs text-forest/70 mb-2.5">
              Choose specific Tupi attractions you want on your route. The planner will prioritize these and fit the rest to your time and budget.
            </p>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-cream/30 rounded-2xl border border-forest/10">
              {approvedSpots.map((spot) => {
                const isSelected = mustVisitSpotIds.includes(spot.id);
                return (
                  <button
                    key={spot.id}
                    type="button"
                    onClick={() => toggleMustVisit(spot.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      isSelected
                        ? "bg-forest text-cream ring-2 ring-forest/30"
                        : "bg-white border border-forest/15 text-forest hover:bg-cream"
                    }`}
                  >
                    {isSelected ? <Check size={12} className="text-gold" /> : <Plus size={12} className="text-forest/50" />}
                    <span>{spot.name}</span>
                    <span className="text-[10px] opacity-75">
                      ({spot.estimatedEntranceFee ? `₱${spot.estimatedEntranceFee}` : "Free"})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: Tour Pace & Interests */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80 mb-2">
                4. What Interests You Most?
              </label>
              <div className="flex flex-wrap gap-2">
                {cats.data?.categories.map((c) => {
                  const selected = interests.includes(c.slug);
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => toggleInterest(c.slug)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                        selected ? "bg-forest text-cream" : "border border-forest/15 bg-white text-forest hover:bg-cream"
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || durationMinutes < 120}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-forest py-4 text-sm font-bold text-cream shadow-md transition hover:bg-forest-800 disabled:opacity-60"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-cream border-t-transparent" />
                Crafting Your Custom Itinerary…
              </span>
            ) : (
              <>
                <Sparkles size={16} className="text-gold" /> Build My Tupi Itinerary ({formatTimeBadge(startTime)} – {formatTimeBadge(endTime)})
              </>
            )}
          </button>
        </form>

        {/* Results Container */}
        {plan && (
          <FadeIn className="mt-12 space-y-8">
            {/* Header of Plan */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-forest/10 bg-white p-6 shadow-sm">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                    {plan.startTime ?? formatTimeBadge(startTime)} – {plan.endTime ?? formatTimeBadge(endTime)}
                  </span>
                  <span className="rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                    {plan.hours} Hours Tour
                  </span>
                  <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-semibold text-forest">
                    {plan.destinationsCount ?? plan.schedule.filter((b) => b.kind === "spot").length} Affordable Stops
                  </span>
                </div>
                <h2 className="mt-2.5 font-serif text-3xl font-bold text-forest">{plan.title}</h2>
                <p className="mt-1 text-xs text-forest/70">
                  Calibrated for {travelers} traveler{travelers > 1 ? "s" : ""} via {transport} · Schedule runs from {plan.startTime} until prompt return at {plan.endTime}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/map"
                  className="flex items-center gap-1.5 rounded-full border border-forest/20 bg-cream/70 px-4 py-2.5 text-xs font-semibold text-forest hover:bg-cream"
                >
                  <MapPin size={14} className="text-emerald-700" /> View on Map
                </Link>
                <Link
                  href="/routes"
                  className="flex items-center gap-1.5 rounded-full border border-forest/20 bg-cream/70 px-4 py-2.5 text-xs font-semibold text-forest hover:bg-cream"
                >
                  <Route size={14} className="text-forest" /> Multi-Stop Route
                </Link>
                <button
                  type="button"
                  onClick={saveTrip}
                  className="flex items-center gap-1.5 rounded-full bg-forest px-5 py-2.5 text-xs font-semibold text-cream hover:bg-forest-800"
                >
                  <Bookmark size={14} /> Save to My Trips
                </button>
              </div>
            </div>

            {/* Timeline Schedule */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-serif text-2xl font-bold text-forest">
                    Tour Schedule ({plan.destinationsCount ?? plan.schedule.filter((b) => b.kind === "spot").length} Affordable Stopovers)
                  </h3>
                  <p className="text-xs text-forest/60">
                    Strictly calibrated to your window: departure at <strong>{plan.startTime}</strong> and return at <strong>{plan.endTime}</strong>.
                  </p>
                </div>
                <span className="text-xs font-bold text-forest/70 bg-cream px-3 py-1 rounded-full border border-forest/15">
                  100% Within Tupi, South Cotabato
                </span>
              </div>

              <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-forest/20">
                {(() => {
                  let spotCounter = 0;
                  return plan.schedule.map((b, i) => {
                    const isSpot = b.kind === "spot";
                    const isBreak = b.kind === "break";
                    const isReturn = b.kind === "return";
                    if (isSpot) spotCounter++;

                    return (
                      <div key={i} className="relative rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
                        {/* Timeline icon / number */}
                        <div
                          className={`absolute -left-[1.85rem] top-6 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shadow-sm ${
                            isSpot
                              ? "bg-forest text-cream ring-2 ring-forest/20"
                              : isBreak
                              ? "bg-amber-500 text-white ring-2 ring-amber-300"
                              : "bg-emerald-700 text-white ring-2 ring-emerald-300"
                          }`}
                        >
                          {isSpot ? spotCounter : isBreak ? "☕" : "🏁"}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-bold text-forest">
                            {b.time} · {b.minutes} mins
                          </span>
                          <span
                            className={`text-[11px] font-semibold uppercase tracking-wider ${
                              isSpot ? "text-moss" : isBreak ? "text-amber-700 font-bold" : "text-emerald-700 font-bold"
                            }`}
                          >
                            {isSpot ? `Destination Stop #${spotCounter}` : isBreak ? "Refreshment & Snack Break" : "Tour Conclusion"}
                          </span>
                        </div>

                        <h4 className="mt-2 font-serif text-xl font-bold text-forest">{b.title}</h4>
                        <p className="mt-1 text-xs text-forest/70 leading-relaxed">{b.note}</p>

                        {b.spot && (
                          <div className="mt-3 flex items-center justify-between border-t border-forest/10 pt-2 text-xs">
                            <span className="text-forest/60">Barangay {b.spot.barangay}</span>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => removeStopFromRoute(b.spot!.id)}
                                className="inline-flex items-center gap-1 text-amber-800 hover:text-red-700 transition"
                                title="Remove this stop from itinerary"
                              >
                                <Trash2 size={12} /> Remove
                              </button>
                              <Link href={`/spots/${b.spot.slug}`} target="_blank" className="font-semibold text-moss hover:underline">
                                View Details →
                              </Link>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Add More Routes Section (Dynamic In-Itinerary Expansion) */}
            <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-serif text-xl font-bold text-forest flex items-center gap-2">
                    <Plus size={18} className="text-moss" /> Add More Stops to Your Itinerary
                  </h3>
                  <p className="text-xs text-forest/60">
                    Want to explore more? Add another destination and we’ll rebalance your stay times and route within your budget.
                  </p>
                </div>
              </div>

              {/* Destination selector */}
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedSpotToAdd}
                  onChange={(e) => setSelectedSpotToAdd(e.target.value)}
                  className="rounded-xl border border-forest/15 bg-white px-3.5 py-2 text-xs font-semibold text-forest flex-1 max-w-sm"
                >
                  <option value="">-- Choose a Tupi destination to add --</option>
                  {approvedSpots
                    .filter((s) => !mustVisitSpotIds.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Brgy. {s.barangay} · {s.estimatedEntranceFee ? `₱${s.estimatedEntranceFee}` : "Free"})
                      </option>
                    ))}
                </select>

                <button
                  type="button"
                  disabled={!selectedSpotToAdd || busy}
                  onClick={() => {
                    if (selectedSpotToAdd) {
                      addStopToRoute(selectedSpotToAdd);
                      setSelectedSpotToAdd("");
                    }
                  }}
                  className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-cream hover:bg-forest-800 disabled:opacity-50 transition"
                >
                  + Add to Route Now
                </button>
              </div>

              {/* Alternative Nearby Stops with 1-Click "Add to Route" */}
              {plan.alternatives && plan.alternatives.length > 0 && (
                <div className="pt-2">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-forest/80 mb-2">
                    Suggested Alternatives & Nearby Stops in Tupi
                  </span>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {plan.alternatives.map((alt) => (
                      <div
                        key={alt.id}
                        className="rounded-2xl border border-forest/10 bg-cream/40 p-3.5 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-moss">Brgy. {alt.barangay}</span>
                            <span className="text-[10px] font-semibold text-forest/70">
                              {alt.estimatedEntranceFee ? `₱${alt.estimatedEntranceFee}` : "Free"}
                            </span>
                          </div>
                          <h4 className="font-serif text-sm font-bold text-forest mt-1">{alt.name}</h4>
                          <p className="text-[11px] text-forest/70 line-clamp-2 mt-1">{alt.shortDescription}</p>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-forest/10 pt-2">
                          <Link
                            href={`/spots/${alt.slug}`}
                            target="_blank"
                            className="text-[11px] font-semibold text-moss hover:underline"
                          >
                            Details →
                          </Link>
                          <button
                            type="button"
                            onClick={() => addStopToRoute(alt.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-forest px-2.5 py-1 text-[11px] font-bold text-cream hover:bg-forest-800 transition"
                          >
                            <Plus size={12} /> Add to Route
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Estimated Budget Cards */}
            <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-serif text-xl font-bold text-forest">Budget Estimation</h3>
                  <p className="text-xs text-forest/60">{plan.budget.note}</p>
                </div>
                <div>
                  {plan.budget.withinBudget ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                      ✓ Within Target Budget
                      {plan.budget.remainingBudget != null && plan.budget.remainingBudget > 0 && (
                        <span>(₱{plan.budget.remainingBudget.toLocaleString()} remaining)</span>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                      ⚠️ Exceeds Target by ₱{(plan.budget.deficit || 0).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <div className="rounded-2xl bg-cream/70 p-4">
                  <span className="text-[11px] text-forest/60 uppercase">Transportation</span>
                  <p className="font-serif text-xl font-bold text-forest">₱{plan.budget.transportation.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl bg-cream/70 p-4">
                  <span className="text-[11px] text-forest/60 uppercase">Food & Snacks</span>
                  <p className="font-serif text-xl font-bold text-forest">₱{plan.budget.food.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl bg-cream/70 p-4">
                  <span className="text-[11px] text-forest/60 uppercase">Entrance Fees</span>
                  <p className="font-serif text-xl font-bold text-forest">₱{plan.budget.entranceFees.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl bg-forest p-4 text-cream">
                  <span className="text-[11px] text-cream/70 uppercase">Total Estimated</span>
                  <p className="font-serif text-2xl font-bold text-gold">₱{plan.budget.total.toLocaleString()}</p>
                </div>
              </div>

              {/* Actionable Budget Suggestions */}
              {plan.budget.suggestions && plan.budget.suggestions.length > 0 && (
                <div className="mt-4 rounded-2xl bg-amber-50/80 p-4 border border-amber-200">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-900 block mb-1">
                    Smart Budget & Travel Recommendations
                  </span>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-amber-950/85">
                    {plan.budget.suggestions.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* AI Guide Notes */}
            <div className="rounded-3xl border border-gold/30 bg-amber-50/60 p-6">
              <h4 className="font-serif text-lg font-bold text-forest flex items-center gap-2">
                <Sparkles size={18} className="text-gold-600" /> Local Guide Advice
              </h4>
              <p className="mt-2 text-xs text-forest/80 leading-relaxed whitespace-pre-wrap">{plan.aiNotes}</p>
            </div>
          </FadeIn>
        )}
      </main>
    </div>
  );
}
