"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function OnboardingPage() {
  return (
    <RequireAuth>
      <OnboardingForm />
    </RequireAuth>
  );
}

function OnboardingForm() {
  const { refreshMe } = useAuth();
  const router = useRouter();
  const cats = useQuery({
    queryKey: ["cats"],
    queryFn: () => api<{ categories: { slug: string; name: string }[] }>("/api/categories"),
  });
  const [interests, setInterests] = useState<string[]>([]);
  const [budgetPreference, setBudget] = useState("moderate");
  const [tripStyle, setStyle] = useState("relaxed");

  function toggle(slug: string) {
    setInterests((cur) => (cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ interests, budgetPreference, tripStyle, onboardingComplete: true }),
      });
      await refreshMe();
      toast.success("Preferences saved");
      router.push("/explore");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-4xl text-forest">What kind of Tupi day do you want?</h1>
      <p className="mt-2 text-forest/70">This only personalizes recommendations. You can change it later in Profile.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-6 rounded-2xl bg-white p-6">
        <div>
          <p className="font-semibold">Interests</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {cats.data?.categories.map((c) => (
              <button
                type="button"
                key={c.slug}
                onClick={() => toggle(c.slug)}
                className={`rounded-full px-4 py-2 text-sm ${interests.includes(c.slug) ? "bg-forest text-cream" : "bg-cream"}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-sm">
          Budget
          <select value={budgetPreference} onChange={(e) => setBudget(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2">
            <option value="tight">Tight</option>
            <option value="moderate">Moderate</option>
            <option value="open">Open</option>
          </select>
        </label>
        <label className="block text-sm">
          Trip style
          <select value={tripStyle} onChange={(e) => setStyle(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2">
            <option value="relaxed">Relaxed</option>
            <option value="balanced">Balanced</option>
            <option value="packed">Packed</option>
          </select>
        </label>
        <button className="rounded-full bg-gold px-6 py-3 font-semibold text-forest">Save and explore</button>
      </form>
    </div>
  );
}
