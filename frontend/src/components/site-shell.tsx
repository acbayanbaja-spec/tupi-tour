"use client";

import {
  AlertTriangle,
  Bell,
  Compass,
  Globe,
  Heart,
  LogOut,
  Map,
  Menu,
  PhoneCall,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  WifiOff,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { TupiTourLogo, TupiTourLogoIcon } from "@/components/logo";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { getOfflineSyncTime } from "@/lib/offline";
import { ChatWidget } from "./chat-widget";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const path = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState<{ spots: { slug: string; name: string; barangay: string }[] }>({ spots: [] });
  const [unread, setUnread] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Offline detection (Feature 7)
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOffline(!navigator.onLine);
      setLastSync(getOfflineSyncTime());

      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => {
        setIsOffline(true);
        setLastSync(getOfflineSyncTime());
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  const touristNav = useMemo(
    () => [
      { href: "/", label: t("nav.home") },
      { href: "/explore", label: t("nav.explore") },
      { href: "/map", label: t("nav.map") },
      { href: "/planner", label: t("nav.planner") },
      { href: "/routes", label: t("nav.routes") },
      { href: "/trips", label: t("nav.trips") },
      { href: "/favorites", label: t("nav.favorites") },
      { href: "/rewards", label: t("nav.rewards") },
      { href: "/safety", label: t("nav.safety") },
    ],
    [t]
  );

  const nav = useMemo(() => {
    if (user?.role === "admin") return [...touristNav, { href: "/admin", label: t("nav.admin") }];
    if (user?.role === "owner") return [...touristNav, { href: "/owner", label: t("nav.owner") }];
    return touristNav;
  }, [user?.role, touristNav, t]);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    if (!user) return;
    api<{ notifications: { read: boolean }[] }>("/api/notifications")
      .then((d) => setUnread(d.notifications.filter((n) => !n.read).length))
      .catch(() => setUnread(0));
  }, [user, path]);

  useEffect(() => {
    if (q.length < 2) {
      setSuggest({ spots: [] });
      return;
    }
    const timer = setTimeout(() => {
      api<{ spots: { slug: string; name: string; barangay: string }[] }>(`/api/search/suggest?q=${encodeURIComponent(q)}`)
        .then(setSuggest)
        .catch(() => setSuggest({ spots: [] }));
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    const recent = JSON.parse(localStorage.getItem("tupi_recent") || "[]") as string[];
    localStorage.setItem("tupi_recent", JSON.stringify([q, ...recent.filter((x) => x !== q)].slice(0, 8)));
    router.push(`/explore?q=${encodeURIComponent(q)}`);
    setSuggest({ spots: [] });
  }

  return (
    <div className="min-h-screen flex flex-col justify-between">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:px-3 focus:py-2 rounded-lg shadow"
      >
        Skip to main content
      </a>

      {/* Feature 7: Offline Notice Banner */}
      {isOffline && (
        <div className="bg-amber-900 px-4 py-2 text-center text-xs text-cream font-medium flex items-center justify-center gap-2">
          <WifiOff size={14} className="text-amber-300" />
          <span>
            {t("status.offline")} — {t("status.offlineDesc")}{" "}
            {lastSync && (
              <span className="opacity-80">
                ({t("verified.lastChecked")}: {new Date(lastSync).toLocaleTimeString()})
              </span>
            )}
          </span>
        </div>
      )}

      {/* Main Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-forest/10 bg-[#f7f5ef]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          {/* Logo Component (Replaces Earth Icon) */}
          <TupiTourLogo size="md" />

          {/* Desktop Nav Links */}
          <nav className="hidden items-center gap-0.5 text-xs font-semibold xl:flex ml-2" aria-label="Main navigation">
            {nav.map((n) => {
              const active = path === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-full px-2.5 py-1.5 transition ${
                    active
                      ? "bg-forest text-cream shadow-sm"
                      : "text-forest/70 hover:bg-forest/5 hover:text-forest"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          {/* Search Box */}
          <form onSubmit={onSearch} className="relative ml-auto hidden min-w-[200px] flex-1 max-w-xs md:block">
            <Search className="absolute left-3.5 top-2.5 text-forest/40" size={15} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("search.placeholder")}
              className="w-full rounded-full border border-forest/15 bg-white/90 py-1.5 pl-9 pr-3 text-xs text-ink placeholder:text-forest/40 focus:border-forest focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest"
              aria-label="Search destinations"
            />
            {suggest.spots.length > 0 && (
              <div className="absolute mt-1.5 w-full overflow-hidden rounded-2xl border border-forest/10 bg-white p-2 shadow-2xl z-50">
                <span className="block px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-forest/50">
                  {t("search.quickMatches")}
                </span>
                <ul className="space-y-0.5">
                  {suggest.spots.map((s) => (
                    <li key={s.slug}>
                      <Link
                        href={`/spots/${s.slug}`}
                        onClick={() => setSuggest({ spots: [] })}
                        className="flex items-center justify-between rounded-xl px-3 py-2 text-xs hover:bg-cream"
                      >
                        <span className="font-medium text-forest">{s.name}</span>
                        <span className="text-[11px] text-moss">Brgy. {s.barangay}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>

          {/* Right Action Icons: Language Toggle & Notifications */}
          <div className="flex items-center gap-2">
            {/* Feature 6: Language Toggle (EN | FIL) */}
            <div className="flex items-center rounded-full border border-forest/15 bg-white/80 p-0.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`rounded-full px-2 py-0.5 transition ${
                  lang === "en" ? "bg-forest text-cream" : "text-forest/70 hover:text-forest"
                }`}
                title="Switch to English"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang("fil")}
                className={`rounded-full px-2 py-0.5 transition ${
                  lang === "fil" ? "bg-forest text-cream" : "text-forest/70 hover:text-forest"
                }`}
                title="Lumipat sa Filipino"
              >
                FIL
              </button>
            </div>

            {/* Notification Bell */}
            <Link
              href="/notifications"
              className="relative flex h-8 w-8 items-center justify-center rounded-full border border-forest/10 bg-white/80 text-forest/80 hover:bg-white hover:text-forest transition"
              aria-label="Notifications"
            >
              <Bell size={15} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-forest ring-2 ring-white">
                  {unread}
                </span>
              )}
            </Link>

            {/* User Profile or Sign In */}
            {user ? (
              <div className="hidden items-center gap-1.5 sm:flex">
                <Link
                  href="/profile"
                  className="flex items-center gap-2 rounded-full border border-forest/10 bg-white/80 px-2.5 py-1 text-xs font-semibold text-forest hover:bg-white transition"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gold text-forest text-[10px] font-bold">
                    {user.name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <span className="max-w-[80px] truncate">{user.name}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => logout().then(() => router.push("/"))}
                  className="p-1.5 text-forest/50 hover:text-rose-600 transition"
                  title="Sign out"
                >
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="hidden rounded-full bg-forest px-3.5 py-1.5 text-xs font-bold text-cream shadow-sm hover:bg-forest-800 transition sm:inline-block"
              >
                {t("auth.signIn")}
              </Link>
            )}

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-forest/10 bg-white text-forest xl:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {open ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {open && (
          <div className="border-t border-forest/10 bg-white px-4 py-4 xl:hidden space-y-3 shadow-xl">
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-xl p-2.5 transition ${
                    path === n.href ? "bg-forest text-cream" : "bg-cream/60 text-forest"
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </div>

            <div className="pt-2 border-t border-forest/10 flex justify-between items-center text-xs">
              {user ? (
                <>
                  <Link href="/profile" className="font-bold text-forest">
                    Logged in as {user.name}
                  </Link>
                  <button type="button" onClick={() => logout().then(() => router.push("/"))} className="text-rose-600 font-semibold">
                    {t("auth.signOut")}
                  </button>
                </>
              ) : (
                <Link href="/login" className="w-full text-center rounded-full bg-forest py-2.5 font-bold text-cream">
                  {t("auth.signIn")} / {t("auth.register")}
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content Body */}
      <main id="main" className="flex-1">
        {children}
      </main>

      {/* World-Class Footer with Tupi Tour Custom Logo */}
      <footer className="border-t border-forest/10 bg-forest text-cream pt-14 pb-20 md:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
            {/* Column 1: Brand & Logo */}
            <div>
              <TupiTourLogo size="lg" inverted />
              <p className="mt-3 text-xs text-cream/70 leading-relaxed">
                Discover the fruit & flower basket of South Cotabato. Built for visitors exploring Mount Matutum, agricultural heritage, and local farm tourism.
              </p>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-cream/10 px-3 py-1 text-[11px] text-gold font-semibold">
                <ShieldCheck size={14} /> Official Tourism Ecosystem
              </div>
            </div>

            {/* Column 2: Navigation Links */}
            <div className="text-xs">
              <p className="font-bold uppercase tracking-wider text-gold mb-3">Explore Tupi</p>
              <ul className="space-y-2 text-cream/70">
                <li><Link href="/explore" className="hover:text-cream">Browse All Destinations</Link></li>
                <li><Link href="/map" className="hover:text-cream">Interactive GPS Map</Link></li>
                <li><Link href="/planner" className="hover:text-cream">AI Day Trip Planner</Link></li>
                <li><Link href="/routes" className="hover:text-cream">Multi-Stop Route Optimizer</Link></li>
                <li><Link href="/rewards" className="hover:text-cream">Rewards & Voucher Club</Link></li>
                <li><Link href="/safety" className="hover:text-cream">Safety & Emergency Directory</Link></li>
              </ul>
            </div>

            {/* Column 3: Travel Community */}
            <div className="text-xs">
              <p className="font-bold uppercase tracking-wider text-gold mb-3">Host & Traveler Community</p>
              <ul className="space-y-2 text-cream/70">
                <li><Link href="/owner" className="hover:text-cream">Host Workspace (List Spot)</Link></li>
                <li><Link href="/profile" className="hover:text-cream">Digital Traveler Passport</Link></li>
                <li><Link href="/register" className="hover:text-cream">Create Traveler Account</Link></li>
                <li><Link href="/admin" className="hover:text-cream">Municipal Staff Admin</Link></li>
              </ul>
            </div>

            {/* Column 4: Emergency Contacts & Hotlines */}
            <div className="text-xs">
              <p className="font-bold uppercase tracking-wider text-gold mb-3">Emergency & Assistance</p>
              <p className="text-cream/70 mb-2">Tupi Emergency Services & Tourist Assistance:</p>
              <ul className="space-y-1.5 text-cream/80 font-mono text-[11px]">
                <li className="flex items-center gap-1.5">
                  <PhoneCall size={12} className="text-gold" /> MDRRMO Rescue: 911 / (083) 228-1000
                </li>
                <li className="flex items-center gap-1.5">
                  <PhoneCall size={12} className="text-gold" /> PNP Tupi Station: (083) 228-1234
                </li>
                <li className="flex items-center gap-1.5">
                  <PhoneCall size={12} className="text-gold" /> Municipal Tourism: (083) 228-5678
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-cream/10 pt-6 text-center text-xs text-cream/50 flex flex-col sm:flex-row justify-between items-center gap-2">
            <span>© {new Date().getFullYear()} Tupi Municipal Tourism Development. All rights reserved.</span>
            <span>Developed with Next.js, Express, Supabase & Render</span>
          </div>
        </div>
      </footer>

      {/* Floating AI Concierge Chatbot */}
      <ChatWidget />

      {/* Mobile Bottom Quick Navigation Bar */}
      <div className="fixed bottom-3 left-3 right-3 z-30 mx-auto flex max-w-md justify-around rounded-2xl bg-forest/95 p-2 text-cream shadow-2xl backdrop-blur-md md:hidden border border-cream/10">
        <Link
          href="/explore"
          className={`flex flex-col items-center px-2 py-1 text-[10px] font-semibold ${
            path === "/explore" ? "text-gold" : "text-cream/70"
          }`}
        >
          <Compass size={17} />
          <span>Explore</span>
        </Link>
        <Link
          href="/map"
          className={`flex flex-col items-center px-2 py-1 text-[10px] font-semibold ${
            path === "/map" ? "text-gold" : "text-cream/70"
          }`}
        >
          <Map size={17} />
          <span>Map</span>
        </Link>
        <Link
          href="/routes"
          className={`flex flex-col items-center px-2 py-1 text-[10px] font-semibold ${
            path === "/routes" ? "text-gold" : "text-cream/70"
          }`}
        >
          <Route size={17} />
          <span>Routes</span>
        </Link>
        <Link
          href="/rewards"
          className={`flex flex-col items-center px-2 py-1 text-[10px] font-semibold ${
            path === "/rewards" ? "text-gold" : "text-cream/70"
          }`}
        >
          <Sparkles size={17} />
          <span>Rewards</span>
        </Link>
        <Link
          href={user ? "/profile" : "/login"}
          className={`flex flex-col items-center px-2 py-1 text-[10px] font-semibold ${
            path === "/profile" || path === "/login" ? "text-gold" : "text-cream/70"
          }`}
        >
          <UserIcon size={17} />
          <span>{user ? "Me" : "Sign In"}</span>
        </Link>
      </div>
    </div>
  );
}
