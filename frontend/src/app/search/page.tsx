"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { api } from "@/lib/api";

export default function SearchPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const recent = useMemo(() => {
    if (typeof window === "undefined") return [] as string[];
    return JSON.parse(localStorage.getItem("tupi_recent") || "[]") as string[];
  }, []);
  const suggest = useQuery({
    queryKey: ["suggest", q],
    queryFn: () => api<{ spots: { slug: string; name: string; barangay: string }[]; categories: { slug: string; name: string }[] }>(`/api/search/suggest?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  });

  function go(e: FormEvent) {
    e.preventDefault();
    router.push(`/explore?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-serif text-4xl text-forest">Search Tupi</h1>
      <form onSubmit={go} className="mt-6">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Fruit Park, SG Farm, Kablon…"
          className="w-full rounded-full border border-forest/10 bg-white px-5 py-3"
          aria-label="Search"
        />
      </form>
      {suggest.data?.spots.length ? (
        <ul className="mt-6 space-y-2">
          {suggest.data.spots.map((s) => (
            <li key={s.slug}>
              <Link href={`/spots/${s.slug}`} className="block rounded-xl bg-white p-3">
                {s.name}
                <span className="block text-sm text-forest/60">{s.barangay}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-10">
        <p className="text-sm font-semibold">Recent searches</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {recent.map((r) => (
            <Link key={r} href={`/explore?q=${encodeURIComponent(r)}`} className="rounded-full bg-white px-4 py-2 text-sm">
              {r}
            </Link>
          ))}
          {!recent.length && <p className="text-sm text-forest/60">No recent searches yet.</p>}
        </div>
      </div>
    </div>
  );
}
