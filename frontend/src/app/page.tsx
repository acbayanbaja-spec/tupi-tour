"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPinned, Route, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { FadeIn, Stagger } from "@/components/motion";
import { SpotCard, SpotSkeleton } from "@/components/spot-card";
import { api, type Spot } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
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
            <p className="text-sm uppercase tracking-[0.25em] text-gold">Tupi, South Cotabato</p>
            <h1 className="mt-3 max-w-3xl font-serif text-5xl leading-tight md:text-7xl">Discover Tupi. Explore more. Experience local.</h1>
            <p className="mt-4 max-w-xl text-cream/80">
              Farms, fruit parks, highland viewpoints, and practical trip planning — built only for Tupi, not a generic Philippines catalog.
            </p>
          </FadeIn>
          <form onSubmit={search} className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search SG Farm, Fruit Park, Kablon…"
              className="flex-1 rounded-full px-5 py-3 text-ink"
              aria-label="Search Tupi destinations"
            />
            <button className="rounded-full bg-gold px-6 py-3 font-semibold text-forest">Search</button>
          </form>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/explore" className="rounded-full bg-cream px-5 py-2 font-semibold text-forest">
              Explore tourist spots
            </Link>
            <Link href="/planner" className="inline-flex items-center gap-2 rounded-full border border-cream/40 px-5 py-2">
              <Sparkles size={16} /> Plan my trip
            </Link>
            <Link href="/map" className="inline-flex items-center gap-2 rounded-full border border-cream/40 px-5 py-2">
              <MapPinned size={16} /> Explore map
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <FadeIn>
          <h2 className="font-serif text-4xl text-forest">Popular destinations</h2>
          <p className="mt-2 text-forest/70">Places Tupi travelers actually ask about — farms, fruit, faith, and highlands.</p>
        </FadeIn>
        <Stagger className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {spots.isLoading && [1, 2, 3].map((n) => <SpotSkeleton key={n} />)}
          {spots.data?.spots.slice(0, 6).map((s) => (
            <SpotCard key={s.id} spot={s} onFav={() => spots.refetch()} />
          ))}
        </Stagger>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="font-serif text-4xl text-forest">Explore by category</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {cats.data?.categories.map((c) => (
              <Link key={c.slug} href={`/explore?category=${c.slug}`} className="rounded-2xl bg-cream p-5 shadow-lift transition hover:-translate-y-1">
                <h3 className="font-semibold text-forest">{c.name}</h3>
                <p className="mt-2 text-sm text-forest/70">{c.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="grid gap-8 lg:grid-cols-2">
          <FadeIn>
            <h2 className="font-serif text-4xl text-forest">Nearby attractions</h2>
            <p className="mt-3 text-forest/70">Allow location on the map page to sort by distance from where you are standing in Tupi.</p>
            <Link href="/map" className="mt-6 inline-flex rounded-full bg-forest px-5 py-3 font-semibold text-cream">
              Open interactive map
            </Link>
          </FadeIn>
          <FadeIn className="overflow-hidden rounded-2xl bg-moss/20 p-8">
            <MapPinned className="text-forest" />
            <p className="mt-4 font-serif text-2xl">Interactive map preview</p>
            <p className="mt-2 text-sm text-forest/70">Markers, routes, and nearby cards live on the Map workspace — including a free OpenStreetMap fallback if Google Maps is not configured.</p>
          </FadeIn>
        </div>
      </section>

      <section className="bg-forest py-16 text-cream">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-4xl">AI trip planner</h2>
            <p className="mt-3 text-cream/75">Tell Tupi Guide your time, budget, and interests. Get an ordered day with estimated rides and clearly labeled cost guesses.</p>
            <Link href="/planner" className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold px-5 py-3 font-semibold text-forest">
              <Route size={16} /> Build an itinerary
            </Link>
          </div>
          <div>
            <h2 className="font-serif text-4xl">Rewards</h2>
            <p className="mt-3 text-cream/75">Earn points for visits and honest reviews. Redeem catalog items configured by tourism admins — never fake cash.</p>
            <Link href="/rewards" className="mt-6 inline-flex rounded-full border border-cream/30 px-5 py-3">
              View rewards
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="font-serif text-4xl text-forest">Why explore Tupi?</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            ["Fruit & flower basket", "Pineapples, highland berries, and organized fruit trading at Kablon."],
            ["Matutum on the skyline", "Cool air in Glandang and Kablon with the volcano as a daily backdrop."],
            ["A town you can actually plan", "Centralized spots, maps, and trip notes instead of scattered Facebook posts."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl bg-white p-6 shadow-lift">
              <h3 className="font-serif text-2xl text-forest">{t}</h3>
              <p className="mt-2 text-forest/70">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pb-16">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gold px-8 py-12 text-forest">
          <h2 className="font-serif text-4xl">Start your Tupi day from the town proper.</h2>
          <p className="mt-3 max-w-2xl">Ride toward Kablon, taste the fruit park, and keep going if the mountain is clear.</p>
          <Link href="/register" className="mt-6 inline-block rounded-full bg-forest px-6 py-3 font-semibold text-cream">
            Create a free account
          </Link>
        </div>
      </section>
    </div>
  );
}
