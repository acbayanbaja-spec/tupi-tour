"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Compass,
  Copy,
  ExternalLink,
  GripVertical,
  MapPin,
  Navigation,
  Plus,
  Route,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { api, type Spot } from "@/lib/api";

type Trip = { id: string; name: string; notes?: string; spots: Spot[] };

export default function TripsPage() {
  return (
    <RequireAuth>
      <TripsInner />
    </RequireAuth>
  );
}

function TripsInner() {
  const q = useQuery({ queryKey: ["trips"], queryFn: () => api<{ trips: Trip[] }>("/api/trips") });
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const create = useMutation({
    mutationFn: (tripName: string) => api("/api/trips", { method: "POST", body: JSON.stringify({ name: tripName, spotIds: [] }) }),
    onSuccess: () => {
      toast.success("Trip created!");
      setName("");
      setCreating(false);
      q.refetch();
    },
  });

  return (
    <div className="min-h-screen bg-[#f7f5ef] pb-24">
      {/* Header */}
      <div className="border-b border-forest/10 bg-white/70 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-moss">Travel Portfolio</span>
              <h1 className="mt-1 font-serif text-3xl font-bold text-forest sm:text-4xl">My Saved Trips</h1>
              <p className="mt-1 text-xs text-forest/70">
                Organize stops, drag to reorder your itinerary, and launch directions on Google Maps.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCreating(!creating)}
              className="flex items-center gap-1.5 rounded-full bg-forest px-5 py-2.5 text-xs font-semibold text-cream shadow-sm hover:bg-forest-800"
            >
              <Plus size={16} /> New Trip Itinerary
            </button>
          </div>

          {creating && (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (!name.trim()) return;
                create.mutate(name.trim());
              }}
              className="mt-6 flex gap-2 rounded-2xl border border-forest/15 bg-white p-3 shadow-sm"
            >
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Weekend Berry & Fruit Tour 2026"
                className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-xl bg-forest px-4 py-2 text-xs font-semibold text-cream hover:bg-forest-800"
              >
                Create
              </button>
            </form>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 space-y-6">
        {q.data?.trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} onChange={() => q.refetch()} />
        ))}

        {!q.data?.trips.length && (
          <div className="rounded-3xl border border-forest/10 bg-white p-12 text-center">
            <Route size={36} className="mx-auto text-forest/30" />
            <h3 className="mt-4 font-serif text-2xl font-bold text-forest">No saved trips yet</h3>
            <p className="mt-2 text-xs text-forest/60 max-w-md mx-auto">
              Use our AI Planner to generate a custom itinerary or create a new trip and add destinations from the Explore page.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/planner"
                className="rounded-full bg-forest px-5 py-2.5 text-xs font-semibold text-cream hover:bg-forest-800"
              >
                Try AI Trip Planner
              </Link>
              <Link
                href="/explore"
                className="rounded-full border border-forest/20 bg-white px-5 py-2.5 text-xs font-semibold text-forest hover:bg-cream"
              >
                Browse Destinations
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TripCard({ trip, onChange }: { trip: Trip; onChange: () => void }) {
  const [spots, setSpots] = useState(trip.spots);
  const sensors = useSensors(useSensor(PointerSensor));

  async function persist(next: Spot[]) {
    setSpots(next);
    await api(`/api/trips/${trip.id}`, { method: "PATCH", body: JSON.stringify({ spotIds: next.map((s) => s.id) }) });
    onChange();
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = spots.findIndex((s) => s.id === active.id);
    const newIndex = spots.findIndex((s) => s.id === over.id);
    persist(arrayMove(spots, oldIndex, newIndex));
  }

  function launchGoogleMaps() {
    if (!spots.length) {
      toast.error("Add at least one destination to route.");
      return;
    }
    const dest = `${spots[0].lat},${spots[0].lng}`;
    const waypoints = spots.slice(1).map((s) => `${s.lat},${s.lng}`).join("|");
    const url = waypoints
      ? `https://www.google.com/maps/dir/?api=1&destination=${dest}&waypoints=${encodeURIComponent(waypoints)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-forest/10 bg-white shadow-sm transition hover:shadow-md">
      {/* Trip Header */}
      <div className="border-b border-forest/10 bg-cream/40 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="rounded-full bg-forest/10 px-2.5 py-0.5 text-[10px] font-bold text-forest uppercase tracking-wider">
              {spots.length} Destination{spots.length === 1 ? "" : "s"}
            </span>
            <h2 className="mt-1 font-serif text-2xl font-bold text-forest">{trip.name}</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={launchGoogleMaps}
              className="flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-xs font-bold text-forest hover:bg-gold-600 shadow-sm"
              title="Open turn-by-turn route on Google Maps"
            >
              <Navigation size={13} /> Maps Route
            </button>

            <button
              type="button"
              onClick={async () => {
                await api(`/api/trips/${trip.id}/duplicate`, { method: "POST" });
                toast.success("Trip duplicated!");
                onChange();
              }}
              className="rounded-full border border-forest/15 p-2 text-forest/70 hover:bg-white hover:text-forest"
              title="Duplicate trip"
            >
              <Copy size={15} />
            </button>

            <button
              type="button"
              onClick={async () => {
                if (!confirm(`Delete "${trip.name}"?`)) return;
                await api(`/api/trips/${trip.id}`, { method: "DELETE" });
                toast.success("Trip deleted");
                onChange();
              }}
              className="rounded-full border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
              title="Delete trip"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {trip.notes && <p className="mt-2 text-xs text-forest/70 leading-relaxed">{trip.notes}</p>}
      </div>

      {/* Destinations List with Drag and Drop */}
      <div className="p-5 sm:p-6">
        {spots.length > 0 ? (
          <div>
            <p className="text-[11px] text-forest/60 mb-3 flex items-center gap-1 font-medium">
              <GripVertical size={12} /> Drag handles to reorder your sequence of stops
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={spots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2.5">
                  {spots.map((s, idx) => (
                    <SortableItem key={s.id} spot={s} index={idx} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-forest/60">
            No destinations added to this trip yet. Visit{" "}
            <Link href="/explore" className="font-bold underline text-forest">
              Explore
            </Link>{" "}
            to find stops.
          </div>
        )}
      </div>
    </article>
  );
}

function SortableItem({ spot, index }: { spot: Spot; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: spot.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between rounded-2xl border border-forest/10 bg-white p-3.5 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab text-forest/40 hover:text-forest active:cursor-grabbing p-1"
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>

        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cream text-xs font-bold text-forest">
          {index + 1}
        </span>

        <div>
          <h4 className="font-serif font-bold text-forest text-sm">{spot.name}</h4>
          <p className="text-[11px] text-moss flex items-center gap-1">
            <MapPin size={11} /> Barangay {spot.barangay}
          </p>
        </div>
      </div>

      <Link
        href={`/spots/${spot.slug}`}
        target="_blank"
        className="rounded-xl border border-forest/10 p-2 text-forest/60 hover:text-forest hover:bg-cream"
      >
        <ExternalLink size={14} />
      </Link>
    </li>
  );
}
