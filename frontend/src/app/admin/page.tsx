"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Eye,
  Filter,
  FolderTree,
  Gift,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { api, type Spot } from "@/lib/api";

type Tab = "overview" | "spots" | "owners" | "reviews" | "rewards" | "users" | "categories";

export default function AdminPage() {
  return (
    <RequireAuth roles={["admin"]}>
      <AdminDashboard />
    </RequireAuth>
  );
}

function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="min-h-screen bg-[#f7f5ef] pb-24">
      {/* Top Header / Command Center Bar */}
      <div className="border-b border-forest/10 bg-white/80 backdrop-blur-md sticky top-[61px] z-30">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest text-gold shadow-sm">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-forest">Tourism Command Center</h1>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  LGU Supervised
                </span>
              </div>
              <p className="text-xs text-forest/70">
                Tupi, South Cotabato · Real-time destination management & analytics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-forest/10 bg-cream/70 px-3 py-1 text-xs text-forest/80">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              API & DB Online
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mx-auto flex max-w-7xl overflow-x-auto px-4 sm:px-6 scrollbar-none">
          <nav className="flex gap-1 py-1">
            {[
              { id: "overview", label: "Executive Overview", icon: LayoutDashboard },
              { id: "spots", label: "Destinations", icon: MapPin },
              { id: "owners", label: "Host Applications", icon: Building2 },
              { id: "reviews", label: "Moderation & Reports", icon: MessageSquare },
              { id: "rewards", label: "Rewards Catalog", icon: Gift },
              { id: "users", label: "Users & Staff", icon: Users },
              { id: "categories", label: "Categories", icon: FolderTree },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id as Tab)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-all ${
                  tab === id
                    ? "border-forest text-forest"
                    : "border-transparent text-forest/60 hover:border-forest/20 hover:text-forest"
                }`}
              >
                <Icon size={16} className={tab === id ? "text-gold-600" : "opacity-70"} />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Body Content */}
      <main className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        {tab === "overview" && <OverviewTab onNavigate={(t) => setTab(t)} />}
        {tab === "spots" && <SpotsTab />}
        {tab === "owners" && <OwnersTab />}
        {tab === "reviews" && <ReviewsTab />}
        {tab === "rewards" && <RewardsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "categories" && <CategoriesTab />}
      </main>
    </div>
  );
}

// ----------------------------------------------------
// 1. OVERVIEW TAB
// ----------------------------------------------------
function OverviewTab({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const q = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () =>
      api<{
        totals: {
          spots: number;
          pendingSpots: number;
          tourists: number;
          owners: number;
          visits: number;
          reviews: number;
          redemptions: number;
        };
        popular: { name: string; viewCount: number }[];
        mostVisited: { name: string; visitCount: number }[];
        mostSearched: { query: string; count: number }[];
        categories: { name: string; spots: number; views: number }[];
        recentActivity: { id: string; action: string; createdAt: string; meta?: Record<string, unknown> }[];
      }>("/api/admin/overview"),
  });

  const d = q.data;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/70" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-white/70" />
      </div>
    );
  }

  if (!d) return <div className="p-8 text-center text-forest/70">Could not load dashboard statistics.</div>;

  const statCards = [
    { label: "Approved Spots", val: d.totals.spots, sub: `${d.totals.pendingSpots} pending review`, icon: MapPin, color: "bg-emerald-500/10 text-emerald-800", tab: "spots" as Tab },
    { label: "Tourist Accounts", val: d.totals.tourists, sub: "Active travelers", icon: Users, color: "bg-blue-500/10 text-blue-800", tab: "users" as Tab },
    { label: "Registered Hosts", val: d.totals.owners, sub: "Local spot owners", icon: Building2, color: "bg-amber-500/10 text-amber-800", tab: "owners" as Tab },
    { label: "Recorded Visits", val: d.totals.visits, sub: "Physical check-ins", icon: CheckCircle2, color: "bg-purple-500/10 text-purple-800", tab: "overview" as Tab },
    { label: "Visitor Reviews", val: d.totals.reviews, sub: "Published ratings", icon: Star, color: "bg-gold/20 text-forest", tab: "reviews" as Tab },
    { label: "Rewards Redeemed", val: d.totals.redemptions, sub: "Claimed vouchers", icon: Gift, color: "bg-rose-500/10 text-rose-800", tab: "rewards" as Tab },
  ];

  return (
    <div className="space-y-8">
      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => onNavigate(s.tab)}
              className="flex flex-col justify-between rounded-2xl border border-forest/10 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-forest/70">{s.label}</span>
                <span className={`rounded-xl p-2 ${s.color}`}>
                  <Icon size={16} />
                </span>
              </div>
              <div className="mt-3">
                <p className="font-serif text-3xl font-bold text-forest">{s.val}</p>
                <p className="mt-1 text-[11px] text-forest/60">{s.sub}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Charts & Analytics Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Category Views Bar Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-forest/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-forest">Engagement by Category</h2>
              <p className="text-xs text-forest/60">Total visitor view impressions per tourism sector</p>
            </div>
            <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-forest">
              Tupi Tourism Hub
            </span>
          </div>
          <div className="mt-6 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.categories} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#14231c" }} interval={0} angle={-15} textAnchor="end" />
                <YAxis tick={{ fontSize: 12, fill: "#14231c" }} />
                <Tooltip
                  cursor={{ fill: "rgba(28,61,46,0.05)" }}
                  contentStyle={{ backgroundColor: "#1c3d2e", color: "#f6f1e7", borderRadius: "12px", border: "none" }}
                  formatter={(val: number) => [`${val} views`, "Impressions"]}
                />
                <Bar dataKey="views" fill="#1c3d2e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Destination Views Leaderboard */}
        <div className="rounded-2xl border border-forest/10 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold text-forest">Most Viewed Spots</h2>
            <p className="text-xs text-forest/60">Leading attractions across Tupi</p>
            <ul className="mt-5 space-y-3">
              {d.popular.slice(0, 5).map((p, idx) => (
                <li key={p.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cream text-xs font-bold text-forest">
                      {idx + 1}
                    </span>
                    <span className="font-medium text-forest truncate">{p.name}</span>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-moss">
                    {p.viewCount.toLocaleString()} views
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("spots")}
            className="mt-6 inline-flex w-full items-center justify-center gap-1 rounded-xl border border-forest/10 bg-cream/70 py-2.5 text-xs font-semibold text-forest hover:bg-cream"
          >
            Manage All Destinations <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Secondary Row: Search Cloud & Activity Audit */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Most Searched Queries */}
        <div className="rounded-2xl border border-forest/10 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-gold-600" />
            <h2 className="font-serif text-lg font-bold text-forest">What Visitors Search For</h2>
          </div>
          <p className="mt-1 text-xs text-forest/60">Top keywords tourists search before traveling</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {d.mostSearched.length ? (
              d.mostSearched.map((s) => (
                <span
                  key={s.query}
                  className="inline-flex items-center gap-1.5 rounded-full border border-forest/10 bg-cream/70 px-3 py-1.5 text-xs font-medium text-forest"
                >
                  <span>{s.query}</span>
                  <span className="rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] font-bold text-forest">
                    {s.count}
                  </span>
                </span>
              ))
            ) : (
              <p className="text-xs text-forest/60">No searches recorded yet.</p>
            )}
          </div>
        </div>

        {/* Recent Activity Log */}
        <div className="rounded-2xl border border-forest/10 bg-white p-6 shadow-sm">
          <h2 className="font-serif text-lg font-bold text-forest">Recent System Activity</h2>
          <p className="mt-1 text-xs text-forest/60">Audit trail of actions and reviews</p>
          <ul className="mt-4 space-y-2.5 max-h-52 overflow-y-auto pr-2 text-xs scrollbar-thin">
            {d.recentActivity?.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 border-b border-forest/5 pb-2">
                <span className="font-medium text-forest capitalize">{a.action.replace("-", " ")}</span>
                <span className="text-[11px] text-forest/50">
                  {new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
            {!d.recentActivity?.length && (
              <li className="text-forest/60">No recent system events logged.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 2. DESTINATIONS (SPOTS) TAB
// ----------------------------------------------------
function SpotsTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const q = useQuery({
    queryKey: ["admin-spots"],
    queryFn: () =>
      api<{ spots: (Spot & { categoryId?: string; ownerId?: string })[] }>("/api/admin/spots"),
  });

  async function updateStatus(id: string, status: string) {
    try {
      await api(`/api/admin/spots/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      toast.success(`Spot marked as ${status}`);
      q.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function toggleFeature(id: string, current: boolean) {
    try {
      await api(`/api/admin/spots/${id}/feature`, { method: "POST", body: JSON.stringify({ featured: !current }) });
      toast.success(!current ? "Marked as Featured on Home Page" : "Removed from Featured");
      q.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const spots = useMemo(() => {
    let list = q.data?.spots || [];
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((x) => x.name.toLowerCase().includes(s) || x.barangay.toLowerCase().includes(s));
    }
    if (statusFilter !== "all") {
      list = list.filter((x) => x.status === statusFilter);
    }
    return list;
  }, [q.data?.spots, search, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-forest/10 bg-white p-4 shadow-sm">
        <div className="flex flex-1 items-center gap-3 min-w-[260px] max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 text-forest/40" size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search spots by name or barangay…"
              className="w-full rounded-xl border border-forest/15 bg-cream/50 py-2 pl-10 pr-4 text-sm focus:border-forest focus:bg-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-forest/15 bg-cream/50 px-3 py-2 text-sm text-forest font-medium"
          >
            <option value="all">All Statuses</option>
            <option value="approved">Approved & Live</option>
            <option value="pending">Pending Approval</option>
            <option value="rejected">Rejected</option>
          </select>
          <span className="text-xs font-semibold text-forest/70">
            {spots.length} destination{spots.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* Destinations Grid / List */}
      <div className="space-y-3">
        {spots.map((spot) => (
          <div
            key={spot.id}
            className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-forest/10 bg-white p-4 shadow-sm transition hover:border-forest/20"
          >
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-forest/10">
                {spot.images?.[0]?.url ? (
                  <Image src={spot.images[0].url} alt={spot.name} fill className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-forest/40">
                    <MapPin size={24} />
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-serif text-lg font-bold text-forest">{spot.name}</h3>
                  {spot.featured && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-forest">
                      <Star size={10} className="fill-gold" /> Featured
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      spot.status === "approved"
                        ? "bg-emerald-100 text-emerald-800"
                        : spot.status === "pending"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {spot.status.toUpperCase()}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-forest/70">
                  {spot.barangay} · {spot.category?.name || "General Attraction"} · {spot.viewCount} views · {spot.visitCount} visits
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 self-end md:self-center">
              <Link
                href={`/spots/${spot.slug}`}
                target="_blank"
                className="rounded-xl border border-forest/15 p-2 text-forest/70 hover:bg-cream hover:text-forest"
                title="View public destination page"
              >
                <ExternalLink size={16} />
              </Link>

              <button
                type="button"
                onClick={() => toggleFeature(spot.id, Boolean(spot.featured))}
                className={`rounded-xl border p-2 text-xs font-semibold transition ${
                  spot.featured ? "border-gold bg-gold/15 text-forest" : "border-forest/15 text-forest/70 hover:bg-cream"
                }`}
                title={spot.featured ? "Unfeature from home page" : "Feature on home page"}
              >
                <Star size={16} className={spot.featured ? "fill-gold text-gold-600" : ""} />
              </button>

              {spot.status !== "approved" && (
                <button
                  type="button"
                  onClick={() => updateStatus(spot.id, "approved")}
                  className="flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  <Check size={14} /> Approve
                </button>
              )}

              {spot.status !== "rejected" && (
                <button
                  type="button"
                  onClick={() => updateStatus(spot.id, "rejected")}
                  className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  <X size={14} /> Reject
                </button>
              )}
            </div>
          </div>
        ))}

        {!spots.length && (
          <div className="rounded-2xl border border-forest/10 bg-white p-12 text-center text-forest/60">
            No destinations matching the criteria.
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 3. HOST APPLICATIONS TAB
// ----------------------------------------------------
function OwnersTab() {
  const q = useQuery({
    queryKey: ["admin-owners"],
    queryFn: () =>
      api<{
        applications: { id: string; userId: string; businessName: string; notes: string; status: string; createdAt: string }[];
        owners: { id: string; name: string; email: string }[];
      }>("/api/admin/owners"),
  });

  async function setStatus(id: string, status: string) {
    try {
      await api(`/api/admin/owners/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      toast.success(`Host application marked as ${status}`);
      q.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-forest/10 bg-white p-6 shadow-sm">
        <h2 className="font-serif text-2xl font-bold text-forest">Destination Host Verification</h2>
        <p className="mt-1 text-xs text-forest/70">
          Review business credentials and applications before granting spot owner permissions in Tupi.
        </p>
      </div>

      <div className="space-y-3">
        {q.data?.applications.map((app) => (
          <div key={app.id} className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    app.status === "approved"
                      ? "bg-emerald-100 text-emerald-800"
                      : app.status === "submitted"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {app.status}
                </span>
                <h3 className="mt-1 font-serif text-xl font-bold text-forest">{app.businessName}</h3>
                <p className="text-xs text-forest/60">
                  Applied on {new Date(app.createdAt).toLocaleDateString()}
                </p>
              </div>

              {app.status !== "approved" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus(app.id, "approved")}
                    className="flex items-center gap-1.5 rounded-full bg-forest px-4 py-2 text-xs font-semibold text-cream hover:bg-forest-800"
                  >
                    <Check size={14} /> Approve Owner
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(app.id, "rejected")}
                    className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              )}
            </div>
            <div className="mt-4 rounded-xl bg-cream/60 p-3.5 text-xs text-forest/80">
              <span className="font-semibold block mb-1">Applicant Note:</span>
              {app.notes}
            </div>
          </div>
        ))}

        {!q.data?.applications.length && (
          <div className="rounded-2xl border border-forest/10 bg-white p-12 text-center text-forest/60">
            No host applications pending review.
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 4. REVIEWS & REPORTS TAB
// ----------------------------------------------------
function ReviewsTab() {
  const q = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: () =>
      api<{
        reviews: { id: string; spotId: string; userId: string; body: string; rating: number; status: string; createdAt: string }[];
        reports: { id: string; targetType: string; targetId: string; reason: string; status: string; createdAt: string }[];
      }>("/api/admin/reviews"),
  });

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Published Visitor Reviews */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
          <h2 className="font-serif text-xl font-bold text-forest">Visitor Reviews</h2>
          <p className="text-xs text-forest/60">Review ratings published across destinations</p>
        </div>

        <div className="space-y-3">
          {q.data?.reviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-forest/10 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-sm font-bold text-forest">
                  <Star size={16} className="fill-gold text-gold" /> {r.rating} / 5
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    r.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {r.status.toUpperCase()}
                </span>
              </div>
              <p className="mt-2 text-sm text-forest/80 italic">"{r.body}"</p>
              <div className="mt-3 flex items-center justify-between text-xs text-forest/60">
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                {r.status === "published" && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api(`/api/admin/reviews/${r.id}/hide`, { method: "POST" });
                      toast.success("Review hidden from public view");
                      q.refetch();
                    }}
                    className="font-semibold text-rose-700 hover:underline"
                  >
                    Hide Review
                  </button>
                )}
              </div>
            </div>
          ))}
          {!q.data?.reviews.length && (
            <div className="rounded-2xl bg-white p-8 text-center text-xs text-forest/60">No reviews found.</div>
          )}
        </div>
      </div>

      {/* Citizen Flagged Reports */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-600" />
            <h2 className="font-serif text-xl font-bold text-forest">Citizen Reports & Feedback</h2>
          </div>
          <p className="text-xs text-forest/60">Inaccurate hours, closed spots, or incorrect pricing reports</p>
        </div>

        <div className="space-y-3">
          {q.data?.reports.map((rep) => (
            <div key={rep.id} className="rounded-2xl border border-forest/10 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-forest/70">
                  Target: {rep.targetType}
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  {rep.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-forest/80">{rep.reason}</p>
              <p className="mt-2 text-[10px] text-forest/50">
                Submitted {new Date(rep.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
          {!q.data?.reports.length && (
            <div className="rounded-2xl bg-white p-8 text-center text-xs text-forest/60">No reports submitted.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 5. REWARDS CATALOG INVENTORY TAB
// ----------------------------------------------------
function RewardsTab() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pointsCost, setCost] = useState(150);
  const [stock, setStock] = useState(25);
  const [active, setActive] = useState(true);

  const q = useQuery({
    queryKey: ["admin-rewards-list"],
    queryFn: () =>
      api<{ rewards: { id: string; name: string; description: string; pointsCost: number; stock: number; active: boolean }[] }>("/api/rewards"),
  });

  async function handleAddReward(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/admin/rewards", {
        method: "POST",
        body: JSON.stringify({ name, description, pointsCost, stock, active }),
      });
      toast.success("Reward added to traveler catalog!");
      setName("");
      setDescription("");
      q.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      {/* Current Rewards List */}
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
          <h2 className="font-serif text-xl font-bold text-forest">Current Rewards Catalog</h2>
          <p className="text-xs text-forest/60">Travelers redeem these with eco-points earned on check-ins</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {q.data?.rewards.map((r) => (
            <div key={r.id} className="flex flex-col justify-between rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-bold text-forest">
                    {r.pointsCost} Points
                  </span>
                  <span className="text-xs font-semibold text-moss">{r.stock} in stock</span>
                </div>
                <h3 className="mt-3 font-serif text-lg font-bold text-forest">{r.name}</h3>
                <p className="mt-1 text-xs text-forest/70">{r.description}</p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-forest/10 pt-3 text-xs">
                <span className={r.active ? "text-emerald-700 font-semibold" : "text-rose-600 font-semibold"}>
                  {r.active ? "● Active in Catalog" : "○ Inactive"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add New Reward Form */}
      <div>
        <div className="rounded-2xl border border-forest/10 bg-white p-6 shadow-sm sticky top-36">
          <div className="flex items-center gap-2">
            <Gift size={18} className="text-gold-600" />
            <h2 className="font-serif text-xl font-bold text-forest">Create New Reward</h2>
          </div>
          <p className="mt-1 text-xs text-forest/60">Add vouchers, merchandise, or discounts</p>

          <form onSubmit={handleAddReward} className="mt-5 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-forest/80 uppercase">Item Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Free Kablon Jam Jar"
                className="mt-1 w-full rounded-xl border border-forest/15 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-forest/80 uppercase">Description & Terms</label>
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Redeemable at Kablon Fruit Stand upon presentation of digital QR code."
                rows={3}
                className="mt-1 w-full rounded-xl border border-forest/15 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-forest/80 uppercase">Points Cost</label>
                <input
                  type="number"
                  min={10}
                  value={pointsCost}
                  onChange={(e) => setCost(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-forest/15 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-forest/80 uppercase">Inventory Stock</label>
                <input
                  type="number"
                  min={1}
                  value={stock}
                  onChange={(e) => setStock(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-forest/15 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-forest py-3 text-xs font-semibold text-cream hover:bg-forest-800"
            >
              <Plus size={14} /> Add to Catalog
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 6. USERS & STAFF DIRECTORY TAB
// ----------------------------------------------------
function UsersTab() {
  const [filterRole, setFilterRole] = useState("all");
  const q = useQuery({
    queryKey: ["admin-users"],
    queryFn: () =>
      api<{ users: { id: string; email: string; name: string; role: string; points: number; createdAt: string }[] }>("/api/admin/users"),
  });

  const users = useMemo(() => {
    let list = q.data?.users || [];
    if (filterRole !== "all") {
      list = list.filter((u) => u.role === filterRole);
    }
    return list;
  }, [q.data?.users, filterRole]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
        <div>
          <h2 className="font-serif text-2xl font-bold text-forest">User Accounts & Roles</h2>
          <p className="text-xs text-forest/60">Tourism staff, spot owners, and registered travelers</p>
        </div>

        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="rounded-xl border border-forest/15 bg-cream/50 px-3 py-2 text-sm text-forest font-medium"
        >
          <option value="all">All Roles</option>
          <option value="tourist">Tourists / Travelers</option>
          <option value="owner">Spot Owners</option>
          <option value="admin">Administrators</option>
        </select>
      </div>

      <div className="rounded-2xl border border-forest/10 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-forest/10 bg-cream/60 text-forest font-bold uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-forest/5 text-forest/80">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-cream/30 transition">
                <td className="px-5 py-3 font-semibold text-forest">{u.name}</td>
                <td className="px-5 py-3 font-mono">{u.email}</td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      u.role === "admin"
                        ? "bg-purple-100 text-purple-800"
                        : u.role === "owner"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {u.role.toUpperCase()}
                  </span>
                </td>
                <td className="px-5 py-3 font-bold text-gold-600">{u.points} pts</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 7. CATEGORIES TAB
// ----------------------------------------------------
function CategoriesTab() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("MapPin");

  const q = useQuery({
    queryKey: ["cats"],
    queryFn: () => api<{ categories: { id: string; slug: string; name: string; description: string; icon: string }[] }>("/api/categories"),
  });

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name, slug: slug.toLowerCase().replace(/[^a-z0-9]+/g, "-"), description, icon }),
      });
      toast.success("Category added successfully");
      setName("");
      setSlug("");
      setDescription("");
      q.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
          <h2 className="font-serif text-xl font-bold text-forest">Tourism Categories</h2>
          <p className="text-xs text-forest/60">Classifications used for filtering and AI trip generation</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {q.data?.categories.map((c) => (
            <div key={c.id} className="rounded-2xl border border-forest/10 bg-white p-4 shadow-sm">
              <h3 className="font-serif text-lg font-bold text-forest">{c.name}</h3>
              <p className="mt-1 text-xs text-moss font-mono">slug: {c.slug}</p>
              <p className="mt-2 text-xs text-forest/70">{c.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="rounded-2xl border border-forest/10 bg-white p-6 shadow-sm sticky top-36">
          <h2 className="font-serif text-xl font-bold text-forest">Add Category</h2>
          <p className="mt-1 text-xs text-forest/60">Expand Tupi tourism sectors</p>

          <form onSubmit={handleAddCategory} className="mt-5 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-forest/80 uppercase">Category Name</label>
              <input
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                }}
                placeholder="e.g. Waterfalls & Springs"
                className="mt-1 w-full rounded-xl border border-forest/15 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-forest/80 uppercase">Slug</label>
              <input
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="waterfalls-springs"
                className="mt-1 w-full rounded-xl border border-forest/15 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-forest/80 uppercase">Description</label>
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Natural mountain springs, pools, and river trekking."
                rows={2}
                className="mt-1 w-full rounded-xl border border-forest/15 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-forest py-3 text-xs font-semibold text-cream hover:bg-forest-800"
            >
              <Plus size={14} /> Create Category
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
