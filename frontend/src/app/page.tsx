"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPinned, Route, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { FadeIn, Stagger } from "@/components/motion";
import { SpotCard, SpotSkeleton } from "@/components/spot-card";
import { WeatherWidget } from "@/components/weather-widget";
import { api, type Spot } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function HomePage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const spots = useQuery({
    queryKey: ["home-spots"],
    queryFn: () => api<{ spots: Spot[] }>("/api/spots?featured=true"),
  });
  const cats = useQuery({
    queryKey: ["cats"],
    queryFn: () => api<{ categories: { slug: string; name: string; description: string }[] }>("/api/categories"),
  });

  function search(e: FormEvent) {
    e.preventDefault();
    router.push(`/explore?q=${encodeURIComponent(q)}`);
  }

  return (
    <div>
      {/* Hero Section */}
      <section className="relative isolate min-h-[86vh] overflow-hidden">
        <Image
          src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=2000&q=80"
          alt="Highland landscape representing Tupi’s mountain country"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-forest via-forest/55 to-forest/20" />
        <div className="relative mx-auto flex min-h-[86vh] max-w-7xl flex-col justify-end px-4 pb-16 pt-28 text-cream">
          <FadeIn>
            <p className="text-sm uppercase tracking-[0.25em] text-gold font-semibold">Tupi, South Cotabato</p>
            <h1 className="mt-3 max-w-3xl font-serif text-5xl leading-tight md:text-7xl">
              {lang === "fil" ? "Tuklasin ang Tupi. Maranasan ang lokal." : "Discover Tupi. Explore more. Experience local."}
            </h1>
            <p className="mt-4 max-w-xl text-cream/80 text-sm sm:text-base leading-relaxed">
              {lang === "fil"
                ? "Mga sakahan, prutasan, tanawin ng Bundok Matutum, at matalinong pagpaplano ng biyahe para sa iyong paglalakbay."
                : "Farms, fruit parks, highland viewpoints, and practical trip planning — built specifically for Tupi, South Cotabato."}
            </p>
          </FadeIn>

          <form onSubmit={search} className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search SG Farm, Fruit Park, Kablon…"
              className="flex-1 rounded-full px-5 py-3 text-ink text-sm"
              aria-label="Search Tupi destinations"
            />
            <button className="rounded-full bg-gold px-6 py-3 font-semibold text-forest hover:bg-yellow-400 transition">
              Search
            </button>
          </form>

          <div className="mt-6 flex flex-wrap gap-3 text-xs sm:text-sm">
            <Link href="/explore" className="rounded-full bg-cream px-5 py-2 font-semibold text-forest hover:bg-white transition">
              Explore tourist spots
            </Link>
            <Link href="/planner" className="inline-flex items-center gap-2 rounded-full border border-cream/40 px-5 py-2 hover:bg-white/10 transition">
              <Sparkles size={16} /> Plan my trip
            </Link>
            <Link href="/routes" className="inline-flex items-center gap-2 rounded-full border border-cream/40 px-5 py-2 hover:bg-white/10 transition">
              <Route size={16} /> Multi-stop routes
            </Link>
            <Link href="/map" className="inline-flex items-center gap-2 rounded-full border border-cream/40 px-5 py-2 hover:bg-white/10 transition">
              <MapPinned size={16} /> Interactive map
            </Link>
          </div>
        </div>
      </section>

      {/* Main Container */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        {/* Feature 4: Live Highland Weather Widget */}
        <WeatherWidget className="mb-12" />

        {/* Popular Destinations */}
        <section>
          <FadeIn>
            <h2 className="font-serif text-3xl font-bold text-forest sm:text-4xl">Popular destinations</h2>
            <p className="mt-2 text-xs sm:text-sm text-forest/70">
              Places Tupi travelers actually ask about — highland strawberry farms, roadside fruit parks, and mountain lookouts.
            </p>
          </FadeIn>
          <Stagger className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {spots.isLoading && [1, 2, 3].map((n) => <SpotSkeleton key={n} />)}
            {spots.data?.spots.slice(0, 6).map((s) => (
              <SpotCard key={s.id} spot={s} onFav={() => spots.refetch()} />
            ))}
          </Stagger>
        </section>
      </div>

      {/* Categories */}
      <section className="bg-white py-16 border-y border-forest/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="font-serif text-3xl font-bold text-forest sm:text-4xl">Explore by category</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {cats.data?.categories.map((c) => (
              <Link
                key={c.slug}
                href={`/explore?category=${c.slug}`}
                className="rounded-3xl bg-cream/70 p-6 shadow-sm border border-forest/10 transition hover:-translate-y-1 hover:shadow-md hover:bg-cream"
              >
                <h3 className="font-serif text-lg font-bold text-forest">{c.name}</h3>
                <p className="mt-2 text-xs text-forest/70 leading-relaxed">{c.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Nearby Attractions Teaser */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2 items-center">
          <FadeIn>
            <span className="text-xs font-bold uppercase tracking-wider text-moss">Highland Navigation</span>
            <h2 className="mt-1 font-serif text-3xl font-bold text-forest sm:text-4xl">Nearby attractions in Tupi</h2>
            <p className="mt-3 text-xs sm:text-sm text-forest/70 leading-relaxed">
              Enable your GPS location on the interactive map to automatically sort destinations by distance and preview road travel times across barangays.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/map" className="inline-flex rounded-full bg-forest px-5 py-2.5 text-xs font-bold text-cream hover:bg-forest-800 transition">
                Open interactive map →
              </Link>
              <Link href="/safety" className="inline-flex rounded-full border border-forest/20 px-5 py-2.5 text-xs font-bold text-forest hover:bg-cream transition">
                Emergency & Safety Directory
              </Link>
            </div>
          </FadeIn>
          <FadeIn className="overflow-hidden rounded-3xl bg-forest p-8 text-cream shadow-lift relative">
            <div className="relative z-10">
              <span className="text-xs font-bold uppercase tracking-widest text-gold">Mount Matutum Foothills</span>
              <h3 className="mt-2 font-serif text-2xl font-bold">Plan Your Next Highland Road Trip</h3>
              <p className="mt-3 text-xs text-cream/80 leading-relaxed">
                Connect SG Farm, Tupi Fruit Park, and Mariano's Blooming Park in one optimized sequence with our new multi-stop route planner.
              </p>
              <Link
                href="/routes"
                className="mt-6 inline-block rounded-full bg-gold px-5 py-2.5 text-xs font-bold text-forest hover:bg-yellow-400 transition shadow-sm"
              >
                Try Multi-Stop Route Optimizer →
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
