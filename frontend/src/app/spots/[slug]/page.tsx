"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Heart, Share2, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SpotCard } from "@/components/spot-card";
import { api, type Spot } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function SpotPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const q = useQuery({
    queryKey: ["spot", slug],
    queryFn: () =>
      api<{
        spot: Spot;
        rating: { average: number; count: number; distribution: number[] };
        reviews: { id: string; body: string; rating: number; createdAt: string; helpfulCount: number; ownerReply?: string; user: { name: string } }[];
        nearby: Spot[];
        recommended: { spot: Spot; reason: string }[];
      }>(`/api/spots/${slug}`),
  });

  const fav = useMutation({
    mutationFn: () => api(`/api/favorites/${q.data?.spot.id}`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Favorites updated");
      q.refetch();
    },
  });

  if (q.isLoading) return <div className="mx-auto max-w-6xl space-y-4 px-4 py-10"><div className="skeleton h-80" /><div className="skeleton h-8 w-1/2" /></div>;
  if (q.error || !q.data) return <div className="p-10">That destination could not be loaded.</div>;
  const { spot, reviews } = q.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-4 md:grid-cols-2">
        {spot.images.map((img) => (
          <div key={img.url} className="relative h-72 overflow-hidden rounded-2xl">
            <Image src={img.url} alt={img.alt} fill className="object-cover" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <p className="text-sm text-moss">{spot.category?.name} · {spot.dataSource === "curated" ? "Curated listing" : "Owner submitted"}</p>
          <h1 className="font-serif text-4xl text-forest">{spot.name}</h1>
          <p className="mt-2 flex items-center gap-2"><Star className="fill-gold text-gold" size={16} /> {q.data.rating.average} ({q.data.rating.count} reviews)</p>
          <p className="mt-4 text-forest/80">{spot.description}</p>
          <p className="mt-4 text-sm"> {spot.address}</p>
          {spot.operatingHours && (
            <p className="mt-2 text-sm">Hours: {spot.operatingHours.days}, {spot.operatingHours.hours} ({spot.operatingHours.reliability})</p>
          )}
          {spot.estimatedEntranceFee != null && <p className="mt-2 text-sm">Estimated entrance: ₱{spot.estimatedEntranceFee} — confirm on site.</p>}
          <ul className="mt-4 flex flex-wrap gap-2">
            {spot.amenities.map((a) => (
              <li key={a} className="rounded-full bg-white px-3 py-1 text-sm">{a}</li>
            ))}
          </ul>
          <div className="mt-8">
            <h2 className="font-serif text-2xl">Reviews</h2>
            <div className="mt-4 space-y-4">
              {reviews.map((r) => (
                <article key={r.id} className="rounded-2xl bg-white p-4">
                  <p className="font-semibold">{r.user.name} · {r.rating}★</p>
                  <p className="mt-2 text-sm">{r.body}</p>
                  {r.ownerReply && <p className="mt-2 text-sm text-moss">Owner: {r.ownerReply}</p>}
                  <button
                    type="button"
                    className="mt-2 text-xs"
                    onClick={() => api(`/api/reviews/${r.id}/helpful`, { method: "POST" }).then(() => q.refetch())}
                  >
                    Helpful ({r.helpfulCount})
                  </button>
                </article>
              ))}
              {!reviews.length && <p className="text-forest/60">No reviews yet. Be the first visitor to write one.</p>}
            </div>
            {user && (
              <form
                className="mt-6 space-y-3 rounded-2xl bg-white p-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api("/api/reviews", { method: "POST", body: JSON.stringify({ spotId: spot.id, rating, body }) });
                    toast.success("Review published");
                    setBody("");
                    q.refetch();
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                <label className="block text-sm">Your rating
                  <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="ml-2 rounded border px-2 py-1">
                    {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
                  </select>
                </label>
                <textarea required minLength={12} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-xl border p-3" placeholder="How was your visit?" />
                <button className="rounded-full bg-forest px-4 py-2 text-cream">Submit review</button>
              </form>
            )}
          </div>
          {q.data.recommended?.length ? (
            <div className="mt-10">
              <h2 className="font-serif text-2xl">Recommended next</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {q.data.recommended.map((r) => (
                  <div key={r.spot.id}>
                    <p className="mb-2 text-xs text-moss">{r.reason}</p>
                    <SpotCard spot={r.spot} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-10">
            <h2 className="font-serif text-2xl">Nearby</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {q.data.nearby.map((s) => <SpotCard key={s.id} spot={s} />)}
            </div>
          </div>
        </div>
        <aside className="h-fit space-y-3 rounded-2xl bg-white p-4 lg:sticky lg:top-24">
          <a className="block rounded-full bg-gold py-3 text-center font-semibold text-forest" href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`} target="_blank" rel="noreferrer">
            Get directions
          </a>
          <button type="button" onClick={() => user ? fav.mutate() : toast.error("Sign in to save")} className="flex w-full items-center justify-center gap-2 rounded-full border py-3">
            <Heart className={spot.isFavorite ? "fill-rose-500 text-rose-500" : ""} size={16} /> Save
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-full border py-3"
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              toast.success("Link copied");
            }}
          >
            <Share2 size={16} /> Share
          </button>
          <button
            type="button"
            className="w-full rounded-full border py-3 text-sm"
            onClick={async () => {
              if (!user) return toast.error("Sign in first");
              await api("/api/visits", { method: "POST", body: JSON.stringify({ spotId: spot.id }) });
              toast.success("Visit recorded");
            }}
          >
            Check in (earn points)
          </button>
          <form
            className="space-y-2 pt-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user) return toast.error("Sign in first");
              await api("/api/reports", { method: "POST", body: JSON.stringify({ targetType: "spot", targetId: spot.id, reason }) });
              toast.success("Report sent to tourism staff");
              setReason("");
            }}
          >
            <label className="text-sm">Report incorrect information</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border p-2 text-sm" required minLength={8} />
            <button className="text-sm font-semibold">Submit report</button>
          </form>
          <Link href="/map" className="block text-center text-sm text-moss">Open in map</Link>
        </aside>
      </div>
    </div>
  );
}
