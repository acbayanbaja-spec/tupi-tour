"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Eye,
  MapPin,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Upload,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { api, type Spot } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const TUPI_BARANGAYS = [
  "Poblacion",
  "Kablon",
  "Acmon",
  "Bunao",
  "Cebuano",
  "Crossing Rubber",
  "Dote",
  "Glandang",
  "Linan",
  "Lunen",
  "Miasong",
  "Palian",
  "Polonuling",
  "Simbo",
  "Tubo",
];

const PRESET_COORDINATES = [
  { name: "Poblacion (Town Proper)", lat: 6.3347, lng: 124.9669 },
  { name: "Kablon (Fruit Country)", lat: 6.3524, lng: 124.9812 },
  { name: "Glandang (Highlands / SG Farm)", lat: 6.368, lng: 125.012 },
  { name: "Linan (Matutum Base)", lat: 6.3412, lng: 125.045 },
];

const COMMON_AMENITIES = [
  "Parking",
  "Restrooms",
  "Food & Drinks",
  "Fruit Stalls",
  "Mountain View",
  "Camping Area",
  "Guided Tours",
  "Souvenir Shop",
  "Family Friendly",
  "Wheelchair Accessible",
];

export default function OwnerPage() {
  const { user } = useAuth();
  if (user && user.role === "tourist") return <OwnerApply />;
  return (
    <RequireAuth roles={["owner", "admin"]}>
      <OwnerDashboard />
    </RequireAuth>
  );
}

// ----------------------------------------------------
// TOURIST -> OWNER APPLICATION FLOW
// ----------------------------------------------------
function OwnerApply() {
  const [businessName, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [barangay, setBarangay] = useState("Poblacion");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/owner/apply", {
        method: "POST",
        body: JSON.stringify({ businessName, notes: `[Barangay: ${barangay}] ${notes}` }),
      });
      setSubmitted(true);
      toast.success("Application submitted to Tupi Tourism Office!");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-800">
          <CheckCircle2 size={32} />
        </div>
        <h1 className="mt-6 font-serif text-3xl font-bold text-forest">Application Received!</h1>
        <p className="mt-3 text-sm text-forest/70">
          The Tupi Municipal Tourism staff will review <strong>{businessName}</strong>. Once approved, your account will be upgraded to Host Workspace permissions.
        </p>
        <Link
          href="/explore"
          className="mt-8 inline-flex rounded-full bg-forest px-6 py-3 text-sm font-semibold text-cream"
        >
          Return to Explore
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="text-center">
        <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-bold text-forest">Host Accreditation</span>
        <h1 className="mt-3 font-serif text-4xl font-bold text-forest">List Your Destination in Tupi</h1>
        <p className="mt-2 text-sm text-forest/70">
          Connect your farm, flower garden, cafe, or mountain resort to travelers exploring South Cotabato.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-10 space-y-4 rounded-3xl border border-forest/10 bg-white p-8 shadow-lift">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">Business / Spot Name</label>
          <input
            required
            value={businessName}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pine View Eco Farm & Berry Garden"
            className="mt-1.5 w-full rounded-xl border border-forest/15 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">Barangay Location</label>
          <select
            value={barangay}
            onChange={(e) => setBarangay(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-forest/15 px-4 py-3 text-sm text-forest"
          >
            {TUPI_BARANGAYS.map((b) => (
              <option key={b} value={b}>
                Barangay {b}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
            Tell Tourism Staff About Your Destination
          </label>
          <textarea
            required
            minLength={15}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe what you offer (fruit picking, camping, food, entrance fees) and your business registration info."
            rows={4}
            className="mt-1.5 w-full rounded-xl border border-forest/15 px-4 py-3 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-forest py-3.5 text-sm font-semibold text-cream shadow-md transition hover:bg-forest-800 disabled:opacity-60"
        >
          {busy ? "Submitting Application…" : "Submit for Official Review"}
        </button>
      </form>
    </div>
  );
}

// ----------------------------------------------------
// VERIFIED HOST WORKSPACE
// ----------------------------------------------------
function OwnerDashboard() {
  const { user } = useAuth();
  const cats = useQuery({ queryKey: ["cats"], queryFn: () => api<{ categories: { id: string; name: string }[] }>("/api/categories") });
  const dash = useQuery({
    queryKey: ["owner-dash"],
    queryFn: () =>
      api<{
        verification?: { status: string };
        spots: Spot[];
        reviews: { id: string; body: string; rating: number; spotId: string; user?: { name: string }; createdAt?: string }[];
        totals: { views: number; visits: number; rating: number };
      }>("/api/owner/dashboard"),
  });

  const [activeTab, setActiveTab] = useState<"listings" | "add" | "reviews">("listings");

  // Form State
  const [form, setForm] = useState({
    name: "",
    categoryId: "cat-agri",
    description: "",
    shortDescription: "",
    lat: 6.3524,
    lng: 124.9812,
    address: "",
    barangay: "Kablon",
    estimatedEntranceFee: 50,
    imageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1600&q=80",
    amenities: ["Parking", "Restrooms", "Fruit Stalls"],
  });

  const [replies, setReplies] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function toggleAmenity(a: string) {
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a],
    }));
  }

  function applyCoordinatePreset(preset: (typeof PRESET_COORDINATES)[0]) {
    setForm((f) => ({ ...f, lat: preset.lat, lng: preset.lng }));
    toast.info(`Set coordinates to ${preset.name}`);
  }

  async function createSpot(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api("/api/owner/spots", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          images: [{ url: form.imageUrl, alt: form.name }],
        }),
      });
      toast.success("Destination submitted! Tourism staff will review before it goes live.");
      dash.refetch();
      setActiveTab("listings");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const totals = dash.data?.totals || { views: 0, visits: 0, rating: 0 };

  return (
    <div className="min-h-screen bg-[#f7f5ef] pb-24">
      {/* Header Banner */}
      <div className="border-b border-forest/10 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700">
              <Store size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-forest">Host Workspace</h1>
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  <ShieldCheck size={12} /> Accredited Host
                </span>
              </div>
              <p className="text-xs text-forest/70">
                Welcome, {user?.name} · Manage your Tupi destination presence
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("add")}
            className="flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-xs font-semibold text-cream shadow-sm hover:bg-forest-800"
          >
            <Plus size={16} /> List New Destination
          </button>
        </div>

        {/* Workspace Tab Bar */}
        <div className="mx-auto flex max-w-7xl gap-4 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setActiveTab("listings")}
            className={`border-b-2 py-3 text-sm font-semibold transition ${
              activeTab === "listings" ? "border-forest text-forest" : "border-transparent text-forest/60 hover:text-forest"
            }`}
          >
            My Destinations ({dash.data?.spots.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("add")}
            className={`border-b-2 py-3 text-sm font-semibold transition ${
              activeTab === "add" ? "border-forest text-forest" : "border-transparent text-forest/60 hover:text-forest"
            }`}
          >
            + Add Destination Form
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reviews")}
            className={`border-b-2 py-3 text-sm font-semibold transition ${
              activeTab === "reviews" ? "border-forest text-forest" : "border-transparent text-forest/60 hover:text-forest"
            }`}
          >
            Visitor Reviews ({dash.data?.reviews.length || 0})
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        {/* Metric Highlights */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-forest/60 uppercase">Total Impressions</span>
              <span className="rounded-xl bg-blue-50 p-2 text-blue-700">
                <Eye size={16} />
              </span>
            </div>
            <p className="mt-3 font-serif text-3xl font-bold text-forest">{totals.views.toLocaleString()}</p>
            <p className="mt-1 text-xs text-forest/60">Views on Tupi Tour</p>
          </div>

          <div className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-forest/60 uppercase">Physical Check-Ins</span>
              <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                <CheckCircle2 size={16} />
              </span>
            </div>
            <p className="mt-3 font-serif text-3xl font-bold text-forest">{totals.visits.toLocaleString()}</p>
            <p className="mt-1 text-xs text-forest/60">Verified visitor arrivals</p>
          </div>

          <div className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-forest/60 uppercase">Average Rating</span>
              <span className="rounded-xl bg-amber-50 p-2 text-amber-700">
                <Star size={16} />
              </span>
            </div>
            <p className="mt-3 font-serif text-3xl font-bold text-forest">
              {totals.rating ? `${totals.rating} ★` : "New"}
            </p>
            <p className="mt-1 text-xs text-forest/60">From {dash.data?.reviews.length || 0} traveler reviews</p>
          </div>
        </div>

        {/* 1. MY DESTINATIONS */}
        {activeTab === "listings" && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-forest">Your Destination Listings</h2>
              <span className="text-xs text-forest/60">Listed under Tupi Tourism Registry</span>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {dash.data?.spots.map((spot) => (
                <div key={spot.id} className="overflow-hidden rounded-2xl border border-forest/10 bg-white shadow-sm flex flex-col justify-between">
                  <div className="relative h-44 w-full bg-forest/10">
                    {spot.images?.[0]?.url && (
                      <Image src={spot.images[0].url} alt={spot.name} fill className="object-cover" />
                    )}
                    <div className="absolute right-3 top-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold shadow-sm ${
                          spot.status === "approved"
                            ? "bg-emerald-600 text-white"
                            : spot.status === "pending"
                            ? "bg-amber-500 text-white"
                            : "bg-rose-600 text-white"
                        }`}
                      >
                        {spot.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-serif text-xl font-bold text-forest">{spot.name}</h3>
                      <p className="mt-1 flex items-center gap-1 text-xs text-moss">
                        <MapPin size={14} /> Barangay {spot.barangay}
                      </p>
                      <p className="mt-2 line-clamp-2 text-xs text-forest/70">{spot.shortDescription}</p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-forest/10 pt-3">
                      <div className="text-xs text-forest/60">
                        <span>{spot.viewCount} views</span> · <span>{spot.visitCount} visits</span>
                      </div>
                      <Link
                        href={`/spots/${spot.slug}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-forest hover:text-gold-600"
                      >
                        Preview Spot <ExternalLink size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!dash.data?.spots.length && (
              <div className="rounded-2xl border border-forest/10 bg-white p-12 text-center">
                <Store size={36} className="mx-auto text-forest/30" />
                <h3 className="mt-3 font-serif text-xl font-bold text-forest">No destinations listed yet</h3>
                <p className="mt-1 text-xs text-forest/60">Submit your farm or local spot for review by tourism staff.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab("add")}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-xs font-semibold text-cream"
                >
                  <Plus size={14} /> List Your Destination
                </button>
              </div>
            )}
          </div>
        )}

        {/* 2. ADD DESTINATION FORM */}
        {activeTab === "add" && (
          <div className="mt-8 rounded-3xl border border-forest/10 bg-white p-8 shadow-sm">
            <h2 className="font-serif text-2xl font-bold text-forest">Add a New Tupi Destination</h2>
            <p className="mt-1 text-xs text-forest/60">
              Provide accurate location, entrance fees, and photos. All submissions undergo tourism board verification.
            </p>

            <form onSubmit={createSpot} className="mt-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">Destination Name</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Matutum Highland Strawberry Garden"
                    className="mt-1 w-full rounded-xl border border-forest/15 px-3.5 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">Category</label>
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-forest/15 px-3.5 py-2.5 text-sm text-forest"
                  >
                    {cats.data?.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">Barangay</label>
                  <select
                    value={form.barangay}
                    onChange={(e) => setForm({ ...form, barangay: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-forest/15 px-3.5 py-2.5 text-sm text-forest"
                  >
                    {TUPI_BARANGAYS.map((b) => (
                      <option key={b} value={b}>
                        Barangay {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">Estimated Entrance Fee (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.estimatedEntranceFee}
                    onChange={(e) => setForm({ ...form, estimatedEntranceFee: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-forest/15 px-3.5 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">Full Address & Commute Guide</label>
                <input
                  required
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="e.g. Purok 4, Sitio Glandang, Tupi, South Cotabato (15 min tricycle from Poblacion)"
                  className="mt-1 w-full rounded-xl border border-forest/15 px-3.5 py-2.5 text-sm"
                />
              </div>

              {/* Coordinates Quick Presets */}
              <div className="rounded-2xl bg-cream/60 p-4 border border-forest/10">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-forest">
                    GPS Coordinates (Latitude, Longitude)
                  </label>
                  <span className="text-[11px] text-forest/60">Used on interactive map & routing</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PRESET_COORDINATES.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyCoordinatePreset(p)}
                      className="rounded-full border border-forest/15 bg-white px-3 py-1 text-xs text-forest hover:bg-cream"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    step="any"
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })}
                    placeholder="Latitude"
                    className="rounded-xl border border-forest/15 bg-white px-3 py-2 text-sm font-mono"
                  />
                  <input
                    type="number"
                    step="any"
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: Number(e.target.value) })}
                    placeholder="Longitude"
                    className="rounded-xl border border-forest/15 bg-white px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">Cover Image URL</label>
                <input
                  required
                  type="url"
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="mt-1 w-full rounded-xl border border-forest/15 px-3.5 py-2.5 text-sm"
                />
              </div>

              {/* Amenities Grid */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                  Select Available Amenities
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COMMON_AMENITIES.map((am) => (
                    <button
                      key={am}
                      type="button"
                      onClick={() => toggleAmenity(am)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                        form.amenities.includes(am)
                          ? "bg-forest text-cream"
                          : "border border-forest/15 bg-white text-forest/70 hover:bg-cream"
                      }`}
                    >
                      {am}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">Short Tagline (10-20 words)</label>
                <input
                  required
                  minLength={10}
                  value={form.shortDescription}
                  onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
                  placeholder="Highland berry farm with cool breeze and fresh strawberry shakes."
                  className="mt-1 w-full rounded-xl border border-forest/15 px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">In-Depth Destination Story & Guidelines</label>
                <textarea
                  required
                  minLength={25}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Provide opening hours, best times to visit, what travelers should wear, and house rules."
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-forest/15 px-3.5 py-2.5 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-forest py-3.5 text-sm font-semibold text-cream shadow-md hover:bg-forest-800 disabled:opacity-60"
              >
                {submitting ? "Submitting Destination…" : "Submit Destination for Review"}
              </button>
            </form>
          </div>
        )}

        {/* 3. VISITOR REVIEWS & REPLIES */}
        {activeTab === "reviews" && (
          <div className="mt-8 space-y-4">
            <h2 className="font-serif text-2xl font-bold text-forest">Customer Feedback & Replies</h2>
            <p className="text-xs text-forest/60">Respond to travelers to build trust and increase visits</p>

            <div className="space-y-4">
              {dash.data?.reviews.map((r) => (
                <div key={r.id} className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-sm font-bold text-forest">
                      <Star size={16} className="fill-gold text-gold" /> {r.rating} / 5
                    </span>
                    <span className="text-xs text-forest/50">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "Recent"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-forest/80 italic">"{r.body}"</p>

                  {/* Reply Form */}
                  <form
                    className="mt-4 flex gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const replyText = replies[r.id];
                      if (!replyText?.trim()) return;
                      await api(`/api/reviews/${r.id}/reply`, { method: "POST", body: JSON.stringify({ body: replyText }) });
                      toast.success("Owner response published!");
                      setReplies({ ...replies, [r.id]: "" });
                      dash.refetch();
                    }}
                  >
                    <input
                      value={replies[r.id] || ""}
                      onChange={(e) => setReplies({ ...replies, [r.id]: e.target.value })}
                      placeholder="Write an official host response…"
                      className="flex-1 rounded-full border border-forest/15 px-4 py-2 text-xs"
                    />
                    <button
                      type="submit"
                      className="flex items-center gap-1 rounded-full bg-forest px-4 py-2 text-xs font-semibold text-cream hover:bg-forest-800"
                    >
                      <Send size={12} /> Reply
                    </button>
                  </form>
                </div>
              ))}

              {!dash.data?.reviews.length && (
                <div className="rounded-2xl bg-white p-12 text-center text-xs text-forest/60">
                  No traveler reviews yet for your destinations.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
