"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Award,
  CheckCircle2,
  Copy,
  Gift,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrendingUp,
  X,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { api, type Voucher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function RewardsPage() {
  return (
    <RequireAuth>
      <RewardsPortal />
    </RequireAuth>
  );
}

function RewardsPortal() {
  const { user } = useAuth();
  const { t, lang } = useI18n();

  const [activeTab, setActiveTab] = useState<"catalog" | "vouchers" | "history">("catalog");
  const [voucherModal, setVoucherModal] = useState<{ code: string; name: string; expiresAt?: string } | null>(null);

  // Staff verification state (Feature 5)
  const [verifyCode, setVerifyCode] = useState("");
  const [inspectedVoucher, setInspectedVoucher] = useState<Voucher | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

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

  const vouchersQuery = useQuery({
    queryKey: ["vouchers"],
    queryFn: () => api<{ vouchers: Voucher[] }>("/api/vouchers"),
    enabled: Boolean(user),
  });

  const points = q.data?.points ?? user?.points ?? 0;
  const userVouchers = vouchersQuery.data?.vouchers || [];

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
      const res = await api<{ voucher: Voucher; reward: any }>(`/api/rewards/${reward.id}/redeem`, {
        method: "POST",
      });
      setVoucherModal({
        code: res.voucher.code,
        name: reward.name,
        expiresAt: res.voucher.expiresAt,
      });
      toast.success(`Redeemed "${reward.name}"!`);
      q.refetch();
      vouchersQuery.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // Staff / Host Verification Functions (Feature 5)
  async function inspectCode() {
    if (!verifyCode.trim()) return;
    setIsVerifying(true);
    try {
      const res = await api<{ voucher: Voucher }>(`/api/vouchers/${encodeURIComponent(verifyCode.trim())}/verify`);
      setInspectedVoucher(res.voucher);
      toast.success("Voucher located!");
    } catch (err) {
      toast.error((err as Error).message);
      setInspectedVoucher(null);
    } finally {
      setIsVerifying(false);
    }
  }

  async function claimInspected() {
    if (!inspectedVoucher) return;
    try {
      await api(`/api/vouchers/${encodeURIComponent(inspectedVoucher.code)}/claim`, {
        method: "POST",
      });
      toast.success(`Voucher ${inspectedVoucher.code} successfully marked as REDEEMED!`);
      setInspectedVoucher(null);
      setVerifyCode("");
      vouchersQuery.refetch();
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
                  <p className="font-serif text-4xl font-bold text-gold">
                    {points.toLocaleString()} <span className="text-sm font-sans font-normal text-cream">pts</span>
                  </p>
                </div>
              </div>

              {/* Tier Progress Bar */}
              <div className="relative z-10 mt-6 space-y-1.5">
                <div className="flex justify-between text-[11px] text-cream/80">
                  <span>Current Tier</span>
                  <span>{tier.next}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-black/20">
                  <div
                    className="h-full bg-gold transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, tier.progress))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-8 flex flex-wrap gap-2 border-t border-forest/10 pt-4">
            <button
              type="button"
              onClick={() => setActiveTab("catalog")}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold transition ${
                activeTab === "catalog" ? "bg-forest text-cream shadow-sm" : "bg-cream text-forest hover:bg-forest/10"
              }`}
            >
              <Gift size={15} /> Rewards Catalog
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("vouchers")}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold transition ${
                activeTab === "vouchers" ? "bg-forest text-cream shadow-sm" : "bg-cream text-forest hover:bg-forest/10"
              }`}
            >
              <Ticket size={15} /> My Vouchers ({userVouchers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold transition ${
                activeTab === "history" ? "bg-forest text-cream shadow-sm" : "bg-cream text-forest hover:bg-forest/10"
              }`}
            >
              <TrendingUp size={15} /> Points History
            </button>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Host / Staff Voucher Verification Portal (Feature 5) */}
        {(user?.role === "admin" || user?.role === "owner") && (
          <div className="mb-8 rounded-3xl border border-forest/15 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-forest">
              <ShieldCheck className="text-gold" size={20} />
              <h2 className="font-serif text-lg font-bold">Host / Staff Voucher Verification Portal</h2>
            </div>
            <p className="text-xs text-forest/70 mt-1">
              Verify and redeem customer vouchers presented at your attraction or tourism desk.
            </p>

            <div className="mt-4 flex flex-col sm:flex-row gap-2 max-w-md">
              <input
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.toUpperCase())}
                placeholder="Enter Code (e.g. TUPI-ABCD-1234)"
                className="flex-1 rounded-full border border-forest/20 px-4 py-2 font-mono text-xs uppercase"
              />
              <button
                type="button"
                onClick={inspectCode}
                disabled={isVerifying || !verifyCode.trim()}
                className="rounded-full bg-forest px-5 py-2 text-xs font-bold text-cream hover:bg-forest-800 disabled:opacity-50"
              >
                {isVerifying ? "Checking..." : "Inspect Code"}
              </button>
            </div>

            {inspectedVoucher && (
              <div className="mt-4 rounded-2xl bg-cream/80 p-4 border border-forest/15 max-w-md">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-forest text-sm">{inspectedVoucher.code}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      inspectedVoucher.status === "active"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {inspectedVoucher.status}
                  </span>
                </div>
                <p className="text-xs font-bold text-forest mt-1">{inspectedVoucher.rewardName}</p>
                <p className="text-[11px] text-forest/60 mt-1">
                  Expires: {new Date(inspectedVoucher.expiresAt).toLocaleDateString()}
                </p>

                {inspectedVoucher.status === "active" && (
                  <button
                    type="button"
                    onClick={claimInspected}
                    className="mt-3 w-full rounded-full bg-emerald-700 py-2 text-xs font-bold text-cream hover:bg-emerald-800 transition"
                  >
                    ✓ Confirm & Claim Voucher Now
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 1: Catalog */}
        {activeTab === "catalog" && (
          <div className="space-y-6">
            {/* How to Earn Points Guide */}
            <div className="rounded-3xl border border-forest/15 bg-gradient-to-r from-forest to-forest-800 p-6 text-cream shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold">Earn & Redeem Loop</span>
              <h3 className="mt-1 font-serif text-xl font-bold">How to Earn Eco-Points</h3>
              <p className="mt-1 text-xs text-cream/80">
                Collect points through active tourism activities in Tupi and redeem them for genuine local souvenirs.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
                <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm border border-white/15">
                  <span className="block text-gold font-bold text-base">+50 pts</span>
                  <span className="font-semibold block mt-0.5">Daily Visit Check-in</span>
                  <span className="text-[11px] text-cream/70 block mt-0.5">Visit Tupi Tour once each day to collect your attendance boost.</span>
                </div>
                <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm border border-white/15">
                  <span className="block text-gold font-bold text-base">+25 pts</span>
                  <span className="font-semibold block mt-0.5">Verified Spot Review</span>
                  <span className="text-[11px] text-cream/70 block mt-0.5">Leave an honest review and rating on any accredited Tupi spot.</span>
                </div>
                <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm border border-white/15">
                  <span className="block text-gold font-bold text-base">+100 pts</span>
                  <span className="font-semibold block mt-0.5">Custom Trip Planner</span>
                  <span className="text-[11px] text-cream/70 block mt-0.5">Build and save your custom itinerary in the AI Planner.</span>
                </div>
              </div>
            </div>

            <div>
              <h2 className="font-serif text-2xl font-bold text-forest">Redeem Local Tupi Rewards</h2>
              <p className="text-xs text-forest/70">
                Redeem your points for authentic fruit tasting notes, stickers, and local farm experiences.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {q.data?.rewards.map((r) => {
                const canAfford = points >= r.pointsCost;
                return (
                  <div
                    key={r.id}
                    className="flex flex-col justify-between rounded-3xl border border-forest/10 bg-white p-6 shadow-sm hover:shadow-md transition"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-gold/20 px-3 py-1 font-mono text-xs font-bold text-forest">
                          {r.pointsCost} points
                        </span>
                        <span className="text-[11px] text-moss font-semibold">
                          {r.stock > 0 ? `${r.stock} left in stock` : "Out of stock"}
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

        {/* Tab 2: My Vouchers (Feature 5: Verifiable Vouchers) */}
        {activeTab === "vouchers" && (
          <div className="space-y-6">
            <div>
              <h2 className="font-serif text-2xl font-bold text-forest">Your Claimed Travel Vouchers</h2>
              <p className="text-xs text-forest/70">
                Show these verifiable voucher codes at participating Tupi spots or the municipal tourism desk.
              </p>
            </div>

            {userVouchers.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-forest/20 p-12 text-center bg-white/40">
                <Ticket className="mx-auto text-forest/30 mb-3" size={40} />
                <h3 className="font-serif text-lg font-bold text-forest">No Vouchers Yet</h3>
                <p className="text-xs text-forest/60 max-w-sm mx-auto mt-1">
                  Redeem your eco-points in the Rewards Catalog to unlock stickers, fruit tasting notes, and discounts.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {userVouchers.map((v) => {
                  const isActive = v.status === "active";
                  return (
                    <div
                      key={v.id}
                      className={`rounded-3xl border p-6 shadow-sm flex flex-col justify-between ${
                        isActive ? "bg-white border-forest/15" : "bg-cream/40 border-forest/10 opacity-75"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {v.status}
                          </span>
                          <span className="text-[10px] text-forest/60 font-mono">
                            Expires: {new Date(v.expiresAt).toLocaleDateString()}
                          </span>
                        </div>

                        <h3 className="mt-3 font-serif text-lg font-bold text-forest">{v.rewardName || "Reward Perk"}</h3>
                        {v.rewardDescription && (
                          <p className="text-xs text-forest/70 mt-1 line-clamp-2">{v.rewardDescription}</p>
                        )}

                        <div className="mt-4 rounded-2xl bg-cream p-3 border border-forest/10 text-center">
                          <span className="text-[10px] uppercase font-bold text-forest/60 block">Voucher Code</span>
                          <span className="font-mono text-base font-bold text-forest tracking-wider select-all">
                            {v.code}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-forest/10 flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(v.code);
                            toast.success("Voucher code copied!");
                          }}
                          className="inline-flex items-center gap-1 font-semibold text-forest hover:text-emerald-700"
                        >
                          <Copy size={13} /> Copy Code
                        </button>

                        <button
                          type="button"
                          onClick={() => setVoucherModal({ code: v.code, name: v.rewardName || "Reward Voucher", expiresAt: v.expiresAt })}
                          className="font-bold text-gold hover:underline"
                        >
                          View Pass →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Points History */}
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
              Verifiable Travel Voucher
            </span>
            <h3 className="font-serif text-2xl font-bold text-forest">{voucherModal.name}</h3>

            <div className="mt-5 rounded-2xl bg-cream p-4 border border-forest/10">
              <p className="text-[11px] font-semibold text-forest/70 uppercase">Claim Code</p>
              <p className="mt-1 font-mono text-xl font-bold tracking-wider text-forest select-all">
                {voucherModal.code}
              </p>
              {voucherModal.expiresAt && (
                <p className="text-[10px] text-forest/50 mt-1">
                  Valid until {new Date(voucherModal.expiresAt).toLocaleDateString()}
                </p>
              )}
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-forest/60">
                <QrCode size={14} /> Present code at attraction for staff verification
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
