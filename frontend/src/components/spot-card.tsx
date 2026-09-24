"use client";

import { Heart, MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { api, type Spot } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { itemFade } from "./motion";

export function SpotCard({ spot, onFav }: { spot: Spot; onFav?: () => void }) {
  const { user } = useAuth();
  async function fav() {
    if (!user) {
      toast.error("Sign in to save destinations.");
      return;
    }
    const res = await api<{ saved: boolean }>(`/api/favorites/${spot.id}`, { method: "POST" });
    toast.success(res.saved ? "Saved to favorites" : "Removed from favorites");
    onFav?.();
  }
  return (
    <motion.article variants={itemFade} whileHover={{ y: -4 }} className="group overflow-hidden rounded-2xl bg-white shadow-lift">
      <div className="relative h-52">
        <Image src={spot.images[0]?.url || "/hero.jpg"} alt={spot.images[0]?.alt || spot.name} fill className="object-cover transition duration-500 group-hover:scale-105" />
        <button
          type="button"
          onClick={fav}
          aria-label={spot.isFavorite ? "Remove favorite" : "Save favorite"}
          className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-forest shadow"
        >
          <Heart className={spot.isFavorite ? "fill-rose-500 text-rose-500" : ""} size={18} />
        </button>
        {spot.category && (
          <span className="absolute left-3 top-3 rounded-full bg-cream/95 px-3 py-1 text-xs font-semibold text-forest">{spot.category.name}</span>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-serif text-xl text-forest">{spot.name}</h3>
          <span className="inline-flex items-center gap-1 text-sm font-medium">
            <Star size={14} className="fill-gold text-gold" />
            {spot.rating.average || "New"}
          </span>
        </div>
        <p className="line-clamp-2 text-sm text-forest/70">{spot.shortDescription}</p>
        <p className="flex items-center gap-1 text-xs text-moss">
          <MapPin size={14} />
          {spot.barangay}
          {spot.distanceKm != null ? ` · ${spot.distanceKm} km` : ""}
        </p>
        <Link href={`/spots/${spot.slug}`} className="inline-flex rounded-full bg-forest px-4 py-2 text-sm font-semibold text-cream">
          View details
        </Link>
      </div>
    </motion.article>
  );
}

export function SpotSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-white">
      <div className="skeleton h-52 rounded-none" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-6 w-2/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-1/2" />
      </div>
    </div>
  );
}
