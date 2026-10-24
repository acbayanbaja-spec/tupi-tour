"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bike,
  Bookmark,
  Calendar,
  Car,
  Clock,
  Coins,
  Compass,
  Footprints,
  MapPin,
  Route,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
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

function formatTimeBadge(t: string): string {
  const parts = t.split(":");
  let h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${displayH} ${period}` : `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

const COMMON_TIME_PRESETS = [
  { label: "9:00 AM – 3:00 PM (6 hrs)", start: "09:00", end: "15:00" },
  { label: "8:00 AM – 1:00 PM (5 hrs)", start: "08:00", end: "13:00" },
  { label: "8:00 AM – 12:00 PM (4 hrs)", start: "08:00", end: "12:00" },
  { label: "8:00 AM – 4:00 PM (8 hrs)", start: "08:00", end: "16:00" },
];

export default function PlannerPage() {
  const { user } = useAuth();
  const cats = useQuery({ queryKey: ["cats"], queryFn: () => api<{ categories: { slug: string; name: string }[] }>("/api/categories") });

  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("15:00");
  const [budget, setBudget] = useState(1000);
  const [travelers, setTravelers] = useState(2);
  const [transport, setTransport] = useState<"tricycle" | "motorcycle" | "car" | "jeepney">("tricycle");
  const [intensity, setIntensity] = useState<"easy" | "moderate" | "active">("moderate");
  const [interests, setInterests] = useState<string[]>(["agri-tourism", "nature"]);
  const [plan, setPlan] = useState<Itinerary | null>(null);
  const [busy, setBusy] = useState(false);

  const startMin = parseMinutes(startTime);
  const endMin = parseMinutes(endTime);
  const durationMinutes = endMin > startMin ? endMin - startMin : 0;
  const durationHours = +(durationMinutes / 60).toFixed(1);

  function toggleInterest(slug: string) {
    setInterests((c) => (c.includes(slug) ? c.filter((x) => x !== slug) : [...c, slug]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
      const data = await api<{ itinerary: Itinerary }>("/api/itinerary", {
        method: "POST",
        body: JSON.stringify({
          startTime,
          endTime,
          hours: durationHours,
          budget,
          travelers,
          transport,
          intensity,
          interests,
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
            Choose your start and end time (e.g. 9:00 AM to 3:00 PM) and budget. Your tour schedule and affordable stopovers are calibrated strictly to fit your exact hours.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
        {/* Form Container */}
        <form onSubmit={onSubmit} className="rounded-3xl border border-forest/10 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          {/* Quick Schedule Presets */}
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-forest/80 mb-2">
              Popular Tour Time Windows
            </span>
            <div className="flex flex-wrap gap-2">
              {COMMON_TIME_PRESETS.map((preset) => {
                const active = startTime === preset.start && endTime === preset.end;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setStartTime(preset.start);
                      setEndTime(preset.end);
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
          </div>

          {/* Row 1: Start Time, End Time, Group Size, Budget */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Start Time */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                Start Time
              </label>
              <div className="relative mt-1.5">
                <Clock className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={16} />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-xl border border-forest/15 px-3.5 py-2.5 pl-10 text-sm font-semibold"
                />
              </div>
              <span className="mt-1 block text-[11px] text-forest/60">
                Departure: <strong className="text-forest">{formatTimeBadge(startTime)}</strong>
              </span>
            </div>

            {/* End Time */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                End Time
              </label>
              <div className="relative mt-1.5">
                <Clock className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={16} />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-xl border border-forest/15 px-3.5 py-2.5 pl-10 text-sm font-semibold"
                />
              </div>
              <span className="mt-1 block text-[11px] text-forest/60">
                Return by: <strong className="text-forest">{formatTimeBadge(endTime)}</strong>
              </span>
            </div>

            {/* Group Size */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                Group Size
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
              <span className="mt-1 block text-[11px] text-forest/60">Number of travelers</span>
            </div>

            {/* Total Budget */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                Total Budget (₱)
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
              <span className="mt-1 block text-[11px] text-forest/60">Stops fitted to what you afford</span>
            </div>
          </div>

          {/* Time window status pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream/70 px-4 py-2.5 text-xs text-forest">
            <span>
              Tour Window: <strong className="font-semibold">{formatTimeBadge(startTime)} to {formatTimeBadge(endTime)}</strong>
            </span>
            <span className="rounded-full bg-forest px-2.5 py-0.5 font-bold text-cream">
              {durationHours > 0 ? `${durationHours} Hours Total` : "Invalid time range"}
            </span>
          </div>

          {/* Row 2: Mode of Transport */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80 mb-2">
              Preferred Mode of Transport
            </label>
            <div className="grid gap-2.5 sm:grid-cols-4">
              {TRANSPORT_OPTIONS.map((t) => {
                const Icon = t.icon;
                const active = transport === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTransport(t.id as typeof transport)}
                    className={`flex flex-col items-start rounded-2xl border p-3.5 text-left transition ${
                      active
                        ? "border-forest bg-forest text-cream ring-2 ring-forest/20"
                        : "border-forest/15 bg-white text-forest hover:bg-cream/50"
                    }`}
                  >
                    <Icon size={18} className={active ? "text-gold" : "text-moss"} />
                    <span className="mt-2 text-xs font-bold">{t.label}</span>
                    <span className={`text-[10px] mt-0.5 ${active ? "text-cream/80" : "text-forest/60"}`}>{t.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Pace */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80 mb-2">
              Tour Pace
            </label>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {INTENSITY_OPTIONS.map((p) => {
                const Icon = p.icon;
                const active = intensity === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setIntensity(p.id as typeof intensity)}
                    className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      active
                        ? "border-forest bg-forest text-cream ring-2 ring-forest/20"
                        : "border-forest/15 bg-white text-forest hover:bg-cream/50"
                    }`}
                  >
                    <Icon size={18} className={active ? "text-gold" : "text-moss"} />
                    <div>
                      <span className="block text-xs font-bold">{p.label}</span>
                      <span className={`text-[10px] ${active ? "text-cream/80" : "text-forest/60"}`}>{p.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 4: Interests */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80 mb-2">
              What Interests You Most?
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

              <div className="flex gap-2">
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
                    Based on your given window: departure at <strong>{plan.startTime}</strong> and return at <strong>{plan.endTime}</strong>.
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
                            <Link href={`/spots/${b.spot.slug}`} target="_blank" className="font-semibold text-moss hover:underline">
                              View Destination Details →
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
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

            {/* Alternative Recommended Spots in Tupi */}
            {plan.alternatives && plan.alternatives.length > 0 && (
              <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm">
                <h3 className="font-serif text-xl font-bold text-forest">Alternative & Nearby Stops in Tupi</h3>
                <p className="text-xs text-forest/60 mb-4">
                  Consider these nearby Tupi spots if you have extra time or want to swap a destination:
                </p>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {plan.alternatives.map((alt) => (
                    <Link
                      key={alt.id}
                      href={`/spots/${alt.slug}`}
                      target="_blank"
                      className="group rounded-2xl border border-forest/10 bg-cream/40 p-3 hover:bg-cream transition flex flex-col justify-between"
                    >
                      <div>
                        <span className="text-[10px] uppercase font-bold text-moss">Brgy. {alt.barangay}</span>
                        <h4 className="font-serif text-sm font-bold text-forest group-hover:text-emerald-800 transition">
                          {alt.name}
                        </h4>
                        <p className="text-[11px] text-forest/70 line-clamp-2 mt-1">{alt.shortDescription}</p>
                      </div>
                      <span className="mt-2 text-[10px] font-semibold text-emerald-700">Explore destination →</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

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
