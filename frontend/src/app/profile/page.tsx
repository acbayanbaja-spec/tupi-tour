"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Award,
  Calendar,
  Camera,
  CheckCircle2,
  Compass,
  Heart,
  MapPin,
  QrCode,
  Route,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  User,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileDashboard />
    </RequireAuth>
  );
}

function ProfileDashboard() {
  const { user, refreshMe } = useAuth();
  const summary = useQuery({
    queryKey: ["profile-summary"],
    queryFn: () =>
      api<{
        favorites: number;
        visits: { id: string; createdAt: string; spot?: { name: string; slug: string; barangay?: string } }[];
        trips: { id: string; name: string }[];
        reviews: { id: string; body: string; rating: number }[];
        badges: { badge?: { name: string; description: string } }[];
        points: number;
      }>("/api/profile/summary"),
  });

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
    setBio(user?.bio || "");
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/profile", { method: "PATCH", body: JSON.stringify({ name, phone, bio }) });
      await refreshMe();
      toast.success("Profile updated successfully!");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const data = summary.data;
  const points = data?.points ?? user?.points ?? 0;

  // Membership Tier calculation
  const tierName =
    points >= 300 ? "Gold Matutum Ambassador" : points >= 150 ? "Silver Highland Explorer" : "Bronze Eco-Traveler";

  return (
    <div className="min-h-screen bg-[#f7f5ef] pb-24">
      {/* Header & Digital Passport Card */}
      <div className="border-b border-forest/10 bg-white/70 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Passport Identity Card */}
            <div className="md:col-span-2 relative overflow-hidden rounded-3xl bg-forest p-6 sm:p-8 text-cream shadow-lift">
              <div className="pointer-events-none absolute -right-10 -top-10 h-60 w-60 rounded-full bg-gold/15 blur-3xl" />
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold font-serif text-2xl font-bold text-forest shadow-md">
                    {user?.name?.[0]?.toUpperCase() || "T"}
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-cream/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                      <ShieldCheck size={12} /> {tierName}
                    </span>
                    <h1 className="mt-1 font-serif text-2xl font-bold text-cream sm:text-3xl">{user?.name}</h1>
                    <p className="text-xs text-cream/70 font-mono">{user?.email}</p>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-[11px] uppercase tracking-wider text-cream/70">Eco-Points</span>
                  <span className="font-serif text-3xl font-bold text-gold">{points}</span>
                </div>
              </div>

              {/* Bio snippet */}
              <div className="relative z-10 mt-6 rounded-2xl bg-cream/10 p-4 backdrop-blur-sm text-xs text-cream/90">
                {user?.bio || "Exploring the cool mountain air, fruit orchards, and highland trails of Tupi, South Cotabato."}
              </div>

              <div className="relative z-10 mt-4 flex items-center justify-between text-[11px] text-cream/60 border-t border-cream/10 pt-3">
                <span>Account Role: <strong className="text-gold capitalize">{user?.role}</strong></span>
                <span>Verified Traveler ID · Tupi LGU Tourism</span>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-3 md:flex md:flex-col md:justify-between">
              <Link href="/favorites" className="rounded-2xl border border-forest/10 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-forest/70">Favorites</span>
                  <Heart size={16} className="text-rose-500 fill-rose-500" />
                </div>
                <p className="mt-2 font-serif text-3xl font-bold text-forest">{data?.favorites ?? 0}</p>
              </Link>

              <Link href="/trips" className="rounded-2xl border border-forest/10 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-forest/70">Trips</span>
                  <Route size={16} className="text-moss" />
                </div>
                <p className="mt-2 font-serif text-3xl font-bold text-forest">{data?.trips.length ?? 0}</p>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 space-y-8">
        {/* Badges Collection */}
        <div className="rounded-3xl border border-forest/10 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-2">
            <Award size={20} className="text-gold-600" />
            <h2 className="font-serif text-2xl font-bold text-forest">Unlocked Explorer Badges</h2>
          </div>
          <p className="text-xs text-forest/60 mt-1">
            Achieved by discovering spots, checking in, and sharing visitor ratings.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {data?.badges
              ?.filter((b): b is typeof b & { badge: { name: string; description: string } } => Boolean(b.badge))
              .map((b) => (
                <div key={b.badge.name} className="flex items-start gap-3 rounded-2xl bg-cream/60 p-4 border border-forest/10">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold-600">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="font-serif text-sm font-bold text-forest">{b.badge.name}</h3>
                    <p className="mt-0.5 text-[11px] text-forest/70 leading-relaxed">{b.badge.description}</p>
                  </div>
                </div>
              ))}

            {!data?.badges?.length && (
              <div className="col-span-full p-6 text-center text-xs text-forest/60">
                No badges earned yet. Check in to spots or write reviews to unlock your first badge!
              </div>
            )}
          </div>
        </div>

        {/* Check-ins Timeline */}
        <div className="rounded-3xl border border-forest/10 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-emerald-700" />
            <h2 className="font-serif text-2xl font-bold text-forest">Verified Spot Check-ins</h2>
          </div>
          <p className="text-xs text-forest/60 mt-1">Places you have physically checked into across Tupi.</p>

          <div className="mt-5 divide-y divide-forest/10">
            {data?.visits.map((v) => (
              <div key={v.id} className="flex items-center justify-between py-3.5 text-xs">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                    <MapPin size={16} />
                  </div>
                  <div>
                    {v.spot ? (
                      <Link href={`/spots/${v.spot.slug}`} className="font-serif text-sm font-bold text-forest hover:underline">
                        {v.spot.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-forest">Tupi Destination</span>
                    )}
                    <p className="text-[11px] text-forest/50">
                      {new Date(v.createdAt).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <span className="font-bold text-emerald-700">+25 pts earned</span>
              </div>
            ))}

            {!data?.visits.length && (
              <div className="py-6 text-center text-xs text-forest/60">
                No spot check-ins yet. Tap "Check in (earn points)" on any spot page when visiting!
              </div>
            )}
          </div>
        </div>

        {/* Edit Profile Form */}
        <div className="rounded-3xl border border-forest/10 bg-white p-6 sm:p-8 shadow-sm">
          <h2 className="font-serif text-2xl font-bold text-forest">Profile Settings</h2>
          <p className="text-xs text-forest/60 mt-1">Update your display information.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">Display Name</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-forest/15 px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">Contact Phone (Optional)</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+63 900 000 0000"
                  className="mt-1 w-full rounded-xl border border-forest/15 px-3.5 py-2.5 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">Traveler Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share your travel interests, favorite fruits, or highland trail experiences."
                rows={3}
                className="mt-1 w-full rounded-xl border border-forest/15 px-3.5 py-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-full bg-forest px-6 py-2.5 text-xs font-semibold text-cream hover:bg-forest-800 disabled:opacity-60"
            >
              <Save size={14} /> {saving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
