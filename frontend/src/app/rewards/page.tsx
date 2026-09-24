"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Award,
  CheckCircle2,
  Copy,
  Gift,
  QrCode,
  Sparkles,
  Ticket,
  TrendingUp,
  X,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function RewardsPage() {
  return (
    <RequireAuth>
      <RewardsPortal />
    </RequireAuth>
  );
}

function RewardsPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"catalog" | "vouchers" | "history">("catalog");
  const [voucherModal, setVoucherModal] = useState<{ code: string; name: string } | null>(null);

  const q = useQuery({
    queryKey: ["rewards"],
    queryFn: () =>
      api<{
        points: number;
        rewards: { id: string; name: string; description: string; pointsCost: number; stock: number; active: boolean }[];
        history: { id: string; amount: number; reason: string; createdAt: string }[];
        redemptions: { id: string; createdAt: string; rewardId: string }[];
        badges: { badge: { name: string } }[];
      }>("/api/rewards"),
  });

  const points = q.data?.points ?? user?.points ?? 0;

  // Membership Tier calculation
  const tier =
    points >= 300
      ? { name: "Gold Matutum Ambassador", next: "Max Tier", progress: 100, color: "from-amber-600 via-amber-500 to-yellow-400" }
      : points >= 150
      ? { name: "Silver Highland Explorer", next: "300 pts for Gold", progress: ((points - 150) / 150) * 100, color: "from-slate-600 via-slate-500 to-slate-400" }
      : { name: "Bronze Eco-Traveler", next: "150 pts for Silver", progress: (points / 150) * 100, color: "from-emerald-900 via-forest to-forest-800" };

  async function redeem(reward: { id: string; name: string; pointsCost: number; stock: number }) {
    if (points < reward.pointsCost) {
      toast.error(`You need ${reward.pointsCost - points} more points to redeem this.`);
      return;
    }
    try {
      await api(`/api/rewards/${reward.id}/redeem`, { method: "POST" });
      const randomCode = `TUPI-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      setVoucherModal({ code: randomCode, name: reward.name });
      toast.success(`Redeemed "${reward.name}"!`);
      q.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5ef] pb-24">
      {/* Top Banner & Passport Card */}
      <div className="border-b border-forest/10 bg-white/70 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Header info */}
            <div className="md:col-span-1 flex flex-col justify-center">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-moss">
                <Sparkles size={14} className="text-gold" /> Tupi Tourist Rewards
              </span>
              <h1 className="mt-2 font-serif text-3xl font-bold text-forest sm:text-4xl">Rewards Club</h1>
              <p className="mt-2 text-xs text-forest/70">
                Earn authentic local eco-points by checking in at approved spots and writing honest reviews.
              </p>
            </div>

            {/* Digital Membership Pass Card */}
            <div className={`md:col-span-2 relative overflow-hidden rounded-3xl bg-gradient-to-r ${tier.color} p-6 text-cream shadow-lift`}>
              <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gold">Digital Travel Pass</span>
                  <h2 className="mt-1 font-serif text-2xl font-bold">{user?.name || "Traveler"}</h2>
                  <p className="text-xs text-cream/80">{tier.name}</p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-cream/70 uppercase">Total Available</span>
                  <p className="font-serif text-4xl font-bold text-gold">{points.toLocaleString()} <span className="text-sm font-sans font-normal text-cream">pts</span></p>
                </div>
              </div>

              {/* Tier Progress Bar */}
              <div className="relative z-10 mt-6 space-y-1.5">
                <div className="flex justify-between text-[11px] text-cream/80">
                  <span>Current Tier</span>
                  <span>{tier.next}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                  <div className="h-full bg-gold transition-all duration-700" style={{ width: `${Math.min(100, Math.max(10, tier.progress))}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="mt-8 flex gap-4 border-b border-forest/10">
            {[
              { id: "catalog", label: "Catalog & Vouchers", icon: Gift },
              { id: "history", label: "Points Ledger", icon: TrendingUp },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id as typeof activeTab)}
                className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition ${
                  activeTab === id ? "border-forest text-forest" : "border-transparent text-forest/60 hover:text-forest"
                }`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Catalog Body */}
      <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        {activeTab === "catalog" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-2xl font-bold text-forest">Redeem Local Perks</h2>
                <p className="text-xs text-forest/60">Official souvenirs, tasting discounts, and municipal partner perks.</p>
              </div>
              <span className="text-xs font-semibold text-forest/70">{q.data?.rewards.length || 0} items available</span>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {q.data?.rewards.map((r) => {
                const canAfford = points >= r.pointsCost;
                return (
                  <div
                    key={r.id}
                    className="flex flex-col justify-between overflow-hidden rounded-3xl border border-forest/10 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-forest/20"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-bold text-forest">
                          {r.pointsCost} Points
                        </span>
                        <span className="text-xs text-forest/60">
                          {r.stock > 0 ? `${r.stock} in stock` : "Out of stock"}
                        </span>
                      </div>

                      <h3 className="mt-4 font-serif text-xl font-bold text-forest">{r.name}</h3>
                      <p className="mt-2 text-xs text-forest/70 leading-relaxed">{r.description}</p>
                    </div>

                    <div className="mt-6 border-t border-forest/10 pt-4">
                      <button
                        type="button"
                        onClick={() => redeem(r)}
                        disabled={!canAfford || r.stock <= 0}
                        className={`w-full rounded-full py-2.5 text-xs font-bold transition shadow-sm ${
                          canAfford && r.stock > 0
                            ? "bg-forest text-cream hover:bg-forest-800"
                            : "bg-forest/10 text-forest/40 cursor-not-allowed"
                        }`}
                      >
                        {r.stock <= 0
                          ? "Out of Stock"
                          : canAfford
                          ? "Redeem Voucher"
                          : `Need ${r.pointsCost - points} more pts`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Points Ledger Tab */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-forest">Points History & Ledger</h2>
            <p className="text-xs text-forest/60">Every check-in, review reward, and voucher redemption is tracked here.</p>

            <div className="rounded-2xl border border-forest/10 bg-white shadow-sm overflow-hidden divide-y divide-forest/5">
              {q.data?.history.map((h) => {
                const isPositive = h.amount > 0;
                return (
                  <div key={h.id} className="flex items-center justify-between p-4 text-xs">
                    <div>
                      <p className="font-semibold text-forest text-sm">{h.reason}</p>
                      <p className="text-forest/50 mt-0.5">
                        {new Date(h.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} at{" "}
                        {new Date(h.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span
                      className={`font-serif text-base font-bold ${
                        isPositive ? "text-emerald-700" : "text-rose-600"
                      }`}
                    >
                      {isPositive ? `+${h.amount}` : h.amount} pts
                    </span>
                  </div>
                );
              })}

              {!q.data?.history.length && (
                <div className="p-8 text-center text-xs text-forest/60">No points activity recorded yet. Start exploring Tupi!</div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Redeemed Voucher Modal */}
      {voucherModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-3xl border border-gold/30 bg-white p-6 shadow-2xl text-center">
            <button
              type="button"
              onClick={() => setVoucherModal(null)}
              className="absolute right-4 top-4 text-forest/40 hover:text-forest"
            >
              <X size={20} />
            </button>

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
              <Ticket size={28} />
            </div>

            <span className="mt-4 inline-block text-xs font-bold uppercase tracking-wider text-moss">
              Voucher Redeemed
            </span>
            <h3 className="font-serif text-2xl font-bold text-forest">{voucherModal.name}</h3>

            <div className="mt-5 rounded-2xl bg-cream p-4 border border-forest/10">
              <p className="text-[11px] font-semibold text-forest/70 uppercase">Claim Code</p>
              <p className="mt-1 font-mono text-xl font-bold tracking-wider text-forest select-all">
                {voucherModal.code}
              </p>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-forest/60">
                <QrCode size={14} /> Present to participating spot or tourism desk
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(voucherModal.code);
                toast.success("Voucher code copied to clipboard!");
              }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-forest py-3 text-xs font-semibold text-cream"
            >
              <Copy size={14} /> Copy Voucher Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
