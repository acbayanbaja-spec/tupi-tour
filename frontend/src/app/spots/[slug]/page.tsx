"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Heart, MapPin, Share2, ShieldAlert, ShieldCheck, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SpotCard } from "@/components/spot-card";
import { api, type Spot } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function SpotPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { t, lang } = useI18n();
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

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10">
        <div className="h-80 w-full animate-pulse rounded-3xl bg-forest/10" />
        <div className="h-8 w-1/2 animate-pulse rounded bg-forest/10" />
      </div>
    );
  }

  if (q.error || !q.data) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h2 className="font-serif text-2xl font-bold text-forest">Destination Not Found</h2>
        <p className="mt-2 text-xs text-forest/70">That tourist spot could not be located or is under review.</p>
        <Link href="/explore" className="mt-4 inline-block rounded-full bg-forest px-5 py-2 text-xs font-bold text-cream">
          Back to Explore
        </Link>
      </div>
    );
  }

  const { spot, reviews } = q.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Photo Gallery Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {spot.images.map((img, i) => (
          <div key={img.url || i} className="relative h-72 sm:h-80 overflow-hidden rounded-3xl shadow-sm">
            <Image src={img.url} alt={img.alt || spot.name} fill className="object-cover" priority={i === 0} />
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Main Details */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-moss">
              {spot.category?.name || "Attraction"} · Brgy. {spot.barangay}
            </span>

            {/* Feature 3: Verified Destination Badge */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                spot.verificationStatus === "verified"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              <ShieldCheck size={13} />
              {spot.verificationStatus === "verified"
                ? lang === "fil"
                  ? "Beripikado ng Munisipyo"
                  : "Verified by Municipal Tourism"
                : "Under Review"}
            </span>

            {spot.lastVerifiedAt && (
              <span className="text-[11px] text-forest/50">
                (Checked: {new Date(spot.lastVerifiedAt).toLocaleDateString()})
              </span>
            )}
          </div>

          <h1 className="mt-2 font-serif text-3xl font-bold text-forest sm:text-4xl">{spot.name}</h1>

          <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-forest">
            <div className="flex items-center text-gold">
              <Star className="fill-gold text-gold" size={16} />
              <span className="ml-1 text-sm font-bold text-forest">{q.data.rating.average}</span>
            </div>
            <span className="text-forest/50">({q.data.rating.count} reviews)</span>
          </div>

          <p className="mt-4 text-sm text-forest/80 leading-relaxed">{spot.description}</p>

          <p className="mt-4 text-xs font-semibold text-moss flex items-center gap-1.5">
            <MapPin size={14} /> {spot.address}
          </p>

          {spot.operatingHours && (
            <p className="mt-2 text-xs text-forest/70">
              <strong>Operating Hours:</strong> {spot.operatingHours.days}, {spot.operatingHours.hours} ({spot.operatingHours.reliability})
            </p>
          )}

          {spot.estimatedEntranceFee != null && (
            <p className="mt-1 text-xs text-forest/70">
              <strong>Estimated Entrance:</strong> ₱{spot.estimatedEntranceFee} per person (confirm on-site).
            </p>
          )}

          {/* Amenities Badges */}
          <ul className="mt-4 flex flex-wrap gap-2">
            {spot.amenities.map((a) => (
              <li key={a} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-forest border border-forest/10">
                {a}
              </li>
            ))}
          </ul>

          {/* Feature 8: Safety Guidance & Emergency Contact */}
          {spot.safetyGuidance && spot.safetyGuidance.length > 0 && (
            <div className="mt-6 rounded-2xl bg-amber-50/90 p-4 border border-amber-200/80 text-xs">
              <h4 className="font-bold text-amber-950 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <ShieldAlert size={15} className="text-amber-700" /> Highland Safety & Visitor Guidance
              </h4>
              <ul className="mt-2 space-y-1 list-disc list-inside text-amber-900 leading-relaxed">
                {spot.safetyGuidance.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
              {spot.emergencyContact && (
                <p className="mt-2 text-[11px] font-mono text-amber-900 font-semibold pt-1 border-t border-amber-200">
                  Tourist Assistance: {spot.emergencyContact}
                </p>
              )}
            </div>
          )}

          {/* Reviews Section */}
          <div className="mt-10 border-t border-forest/10 pt-8">
            <h2 className="font-serif text-2xl font-bold text-forest">Traveler Reviews</h2>
            <div className="mt-4 space-y-4">
              {reviews.map((r) => (
                <article key={r.id} className="rounded-2xl bg-white p-5 shadow-sm border border-forest/5">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-forest text-sm">{r.user.name}</p>
                    <span className="font-bold text-gold text-xs">{r.rating} ★</span>
                  </div>
                  <p className="mt-2 text-xs text-forest/80 leading-relaxed">{r.body}</p>
                  {r.ownerReply && (
                    <div className="mt-3 rounded-xl bg-cream/70 p-3 text-xs text-moss border border-forest/5">
                      <strong className="block text-forest">Host Response:</strong>
                      {r.ownerReply}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-forest/50">
                    <button
                      type="button"
                      className="font-semibold text-moss hover:underline"
                      onClick={() => api(`/api/reviews/${r.id}/helpful`, { method: "POST" }).then(() => q.refetch())}
                    >
                      Helpful ({r.helpfulCount})
                    </button>
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                </article>
              ))}
              {!reviews.length && <p className="text-xs text-forest/60">No reviews yet. Be the first visitor to write one.</p>}
            </div>

            {user && (
              <form
                className="mt-6 space-y-3 rounded-3xl bg-white p-6 shadow-sm border border-forest/10"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api("/api/reviews", { method: "POST", body: JSON.stringify({ spotId: spot.id, rating, body }) });
                    toast.success("Review published! +15 eco-points");
                    setBody("");
                    q.refetch();
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                <h3 className="font-serif text-base font-bold text-forest">Share Your Experience</h3>
                <label className="block text-xs font-semibold text-forest">
                  Rating
                  <select
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="ml-2 rounded-lg border border-forest/20 px-2 py-1 text-xs"
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} Stars
                      </option>
                    ))}
                  </select>
                </label>
                <textarea
                  required
                  minLength={12}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-2xl border border-forest/15 p-3 text-xs"
                  placeholder="How was the scenery, access road, or local produce?"
                  rows={3}
                />
                <button className="rounded-full bg-forest px-5 py-2 text-xs font-bold text-cream hover:bg-forest-800 transition">
                  Submit Review
                </button>
              </form>
            )}
          </div>

          {/* Recommended Next */}
          {q.data.recommended?.length ? (
            <div className="mt-12">
              <h2 className="font-serif text-2xl font-bold text-forest">Recommended Next Stops</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {q.data.recommended.map((r) => (
                  <div key={r.spot.id}>
                    <p className="mb-2 text-[11px] font-bold text-moss uppercase tracking-wider">{r.reason}</p>
                    <SpotCard spot={r.spot} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Nearby */}
          <div className="mt-12">
            <h2 className="font-serif text-2xl font-bold text-forest">Nearby in Tupi</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {q.data.nearby.map((s) => (
                <SpotCard key={s.id} spot={s} />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Sticky Actions */}
        <aside className="h-fit space-y-3 rounded-3xl bg-white p-5 shadow-sm border border-forest/10 lg:sticky lg:top-24">
          <a
            className="block rounded-full bg-gold py-3 text-center text-xs font-bold text-forest hover:bg-yellow-400 transition shadow-sm"
            href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Get GPS Directions →
          </a>

          <button
            type="button"
            onClick={() => (user ? fav.mutate() : toast.error("Sign in to save"))}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-forest/15 py-2.5 text-xs font-semibold text-forest hover:bg-cream transition"
          >
            <Heart className={spot.isFavorite ? "fill-rose-500 text-rose-500" : ""} size={15} />
            {spot.isFavorite ? "Saved to Favorites" : "Save Destination"}
          </button>

          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-forest/15 py-2.5 text-xs font-semibold text-forest hover:bg-cream transition"
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              toast.success("Link copied to clipboard");
            }}
          >
            <Share2 size={15} /> Share Spot
          </button>

          <button
            type="button"
            className="w-full rounded-full bg-forest/5 py-2.5 text-xs font-bold text-forest hover:bg-forest hover:text-cream transition"
            onClick={async () => {
              if (!user) return toast.error("Sign in to record visits and earn points");
              const res = await api<{ visit: any; awarded: boolean }>("/api/visits", {
                method: "POST",
                body: JSON.stringify({ spotId: spot.id }),
              });
              if (res.awarded) {
                toast.success("Visit recorded! +25 eco-traveler points");
              } else {
                toast.info("Visit already recorded today");
              }
            }}
          >
            📍 Check In (Earn 25 Pts)
          </button>

          <Link
            href="/routes"
            className="block text-center rounded-full border border-forest/15 py-2 text-xs font-semibold text-moss hover:bg-cream transition"
          >
            Add to Multi-Stop Route
          </Link>

          <form
            className="space-y-2 pt-4 border-t border-forest/10"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user) return toast.error("Sign in first");
              await api("/api/reports", { method: "POST", body: JSON.stringify({ targetType: "spot", targetId: spot.id, reason }) });
              toast.success("Report submitted to municipal tourism staff");
              setReason("");
            }}
          >
            <label className="text-[11px] font-bold text-forest/70 block">Report Outdated Information</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-forest/15 p-2 text-xs"
              placeholder="Notice incorrect hours or fees?"
              required
              minLength={8}
              rows={2}
            />
            <button className="text-xs font-bold text-forest hover:underline">Submit Report</button>
          </form>
        </aside>
      </div>
    </div>
  );
}
