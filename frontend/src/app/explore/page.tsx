"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Stagger } from "@/components/motion";
import { SpotCard, SpotSkeleton } from "@/components/spot-card";
import { api, type Spot } from "@/lib/api";

function ExploreInner() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [sort, setSort] = useState("popular");
  const cats = useQuery({ queryKey: ["cats"], queryFn: () => api<{ categories: { id: string; slug: string; name: string }[] }>("/api/categories") });
  const query = useMemo(() => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (category) s.set("category", category);
    s.set("sort", sort);
    return s.toString();
  }, [q, category, sort]);
  const spots = useQuery({
    queryKey: ["spots", query],
    queryFn: () => api<{ spots: Spot[] }>(`/api/spots?${query}`),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="font-serif text-4xl text-forest">Explore Tupi</h1>
      <p className="mt-2 text-forest/70">Search, filter, and open any card for maps, reviews, and nearby stops.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search destinations" className="rounded-full border border-forest/10 bg-white px-4 py-2" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-full border border-forest/10 bg-white px-4 py-2">
          <option value="">All categories</option>
          {cats.data?.categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-full border border-forest/10 bg-white px-4 py-2">
          <option value="popular">Popularity</option>
          <option value="rating">Ratings</option>
          <option value="name">Name</option>
          <option value="distance">Distance (if located)</option>
        </select>
      </div>
      {spots.isLoading && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <SpotSkeleton key={n} />
          ))}
        </div>
      )}
      {!spots.isLoading && !spots.data?.spots.length && (
        <div className="mt-16 rounded-2xl bg-white p-10 text-center">
          <p className="font-serif text-2xl">We couldn’t find that destination.</p>
          <p className="mt-2 text-forest/70">Try Fruit Park, SG Farm, or clear filters.</p>
        </div>
      )}
      <Stagger className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {spots.data?.spots.map((s) => (
          <SpotCard key={s.id} spot={s} onFav={() => spots.refetch()} />
        ))}
      </Stagger>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreInner />
    </Suspense>
  );
}
