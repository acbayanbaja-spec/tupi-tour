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
  assumptions: string[];
  schedule: { time: string; title: string; kind: string; minutes: number; note: string; spot?: Spot }[];
  alternatives: Spot[];
  budget: { estimated: boolean; transportation: number; food: number; entranceFees: number; other: number; total: number; withinBudget: boolean; note: string };
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

export default function PlannerPage() {
  const { user } = useAuth();
  const cats = useQuery({ queryKey: ["cats"], queryFn: () => api<{ categories: { slug: string; name: string }[] }>("/api/categories") });

  const [hours, setHours] = useState(8);
  const [budget, setBudget] = useState(2500);
  const [travelers, setTravelers] = useState(2);
  const [transport, setTransport] = useState<"tricycle" | "motorcycle" | "car" | "jeepney">("tricycle");
  const [intensity, setIntensity] = useState<"easy" | "moderate" | "active">("moderate");
  const [interests, setInterests] = useState<string[]>(["agri-tourism", "nature"]);
  const [plan, setPlan] = useState<Itinerary | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleInterest(slug: string) {
    setInterests((c) => (c.includes(slug) ? c.filter((x) => x !== slug) : [...c, slug]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ itinerary: Itinerary }>("/api/itinerary", {
        method: "POST",
        body: JSON.stringify({ hours, budget, travelers, transport, intensity, interests }),
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
            Tell us your time, budget, and travel style. We calculate realistic travel times between Tupi barangays, entrance fees, and fruit market stops.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
        {/* Form Container */}
        <form onSubmit={onSubmit} className="rounded-3xl border border-forest/10 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          {/* Row 1: Duration & Travelers & Budget */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                Duration (Hours)
              </label>
              <div className="relative mt-1.5">
                <Clock className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={16} />
                <input
                  type="number"
                  min={2}
                  max={14}
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                  className="w-full rounded-xl border border-forest/15 px-3.5 py-2.5 pl-10 text-sm font-semibold"
                />
              </div>
              <span className="mt-1 block text-[11px] text-forest/60">e.g. 4 hrs (half day) or 8 hrs (full day)</span>
            </div>

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
              <span className="mt-1 block text-[11px] text-forest/60">Number of people traveling</span>
            </div>

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
              <span className="mt-1 block text-[11px] text-forest/60">Estimated gas, food & entrance</span>
            </div>
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
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-forest py-4 text-sm font-bold text-cream shadow-md transition hover:bg-forest-800 disabled:opacity-60"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-cream border-t-transparent" />
                Crafting Your Custom Itinerary…
              </span>
            ) : (
              <>
                <Sparkles size={16} className="text-gold" /> Build My Tupi Itinerary
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
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                  Custom Route
                </span>
                <h2 className="mt-2 font-serif text-3xl font-bold text-forest">{plan.title}</h2>
                <p className="mt-1 text-xs text-forest/70">
                  Optimized for {travelers} traveler{travelers > 1 ? "s" : ""} via {transport} · {hours} Hours
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
              <h3 className="font-serif text-2xl font-bold text-forest">Tour Schedule & Stopovers</h3>
              <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-forest/20">
                {plan.schedule.map((b, i) => (
                  <div key={i} className="relative rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
                    {/* Timeline dot */}
                    <div className="absolute -left-[1.85rem] top-6 flex h-6 w-6 items-center justify-center rounded-full bg-forest text-xs font-bold text-cream">
                      {i + 1}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-bold text-forest">
                        {b.time} · {b.minutes} mins
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-moss">{b.kind}</span>
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
                ))}
              </div>
            </div>

            {/* Estimated Budget Cards */}
            <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm">
              <h3 className="font-serif text-xl font-bold text-forest">Budget Estimation</h3>
              <p className="text-xs text-forest/60">{plan.budget.note}</p>

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
