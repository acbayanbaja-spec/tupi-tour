"use client";

import { useQuery } from "@tanstack/react-query";
import { Compass, Heart } from "lucide-react";
import Link from "next/link";
import { Stagger } from "@/components/motion";
import { RequireAuth } from "@/components/require-auth";
import { SpotCard, SpotSkeleton } from "@/components/spot-card";
import { api, type Spot } from "@/lib/api";

export default function FavoritesPage() {
  return (
    <RequireAuth>
      <FavoritesView />
    </RequireAuth>
  );
}

function FavoritesView() {
  const q = useQuery({ queryKey: ["favorites"], queryFn: () => api<{ spots: Spot[] }>("/api/favorites") });
  const spots = q.data?.spots || [];

  return (
    <div className="min-h-screen bg-[#f7f5ef] pb-24">
      {/* Header */}
      <div className="border-b border-forest/10 bg-white/70 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex items-center gap-2">
            <Heart size={20} className="text-rose-500 fill-rose-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-moss">Saved Collection</span>
          </div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-forest sm:text-5xl">Favorite Destinations</h1>
          <p className="mt-2 text-sm text-forest/70">
            {spots.length} saved destination{spots.length === 1 ? "" : "s"} ready for your next Tupi journey.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        {q.isLoading && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <SpotSkeleton key={n} />
            ))}
          </div>
        )}

        {!q.isLoading && spots.length === 0 && (
          <div className="rounded-3xl border border-forest/10 bg-white p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
              <Heart size={28} />
            </div>
            <h2 className="mt-4 font-serif text-2xl font-bold text-forest">No favorites saved yet</h2>
            <p className="mt-2 text-xs text-forest/60 max-w-md mx-auto">
              Heart any farm, viewpoint, or fruit park while browsing Explore or the Map to add them to your collection.
            </p>
            <Link
              href="/explore"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3 text-xs font-semibold text-cream hover:bg-forest-800"
            >
              <Compass size={16} /> Explore Destinations
            </Link>
          </div>
        )}

        <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {spots.map((s) => (
            <SpotCard key={s.id} spot={s} onFav={() => q.refetch()} />
          ))}
        </Stagger>
      </main>
    </div>
  );
}
