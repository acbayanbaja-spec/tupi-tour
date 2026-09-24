"use client";

import { Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles, UserCheck, Compass, ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

const DEMO_ACCOUNTS = [
  {
    role: "Tourist",
    title: "Ana Explorer",
    email: "tourist@tupi.tour",
    password: "Tourist123!",
    badge: "Traveler",
    desc: "Test trip planning, favorites & rewards",
    accent: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
  },
  {
    role: "Owner",
    title: "Kablon Farm Owner",
    email: "owner@tupi.tour",
    password: "Owner123!",
    badge: "Verified Host",
    desc: "Test destination listings & reviews",
    accent: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100",
  },
  {
    role: "Admin",
    title: "Tupi Tourism Office",
    email: "admin@tupi.tour",
    password: "AdminTupi2026!",
    badge: "Staff Portal",
    desc: "Test approvals, analytics & rewards",
    accent: "bg-forest/10 text-forest border-forest/20 hover:bg-forest/20",
  },
];

function LoginInner() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  function fillDemo(e: string, p: string, label: string) {
    setEmail(e);
    setPassword(p);
    toast.info(`Filled credentials for ${label}. Click "Sign in" to continue.`);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Welcome back to Tupi Tour!");
      const next = params.get("next");
      if (next) {
        router.push(next);
      } else if (email.includes("admin")) {
        router.push("/admin");
      } else if (email.includes("owner")) {
        router.push("/owner");
      } else {
        router.push("/explore");
      }
    } catch (err) {
      toast.error((err as Error).message || "Sign in failed. Check your credentials.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-64px)] w-full overflow-hidden bg-cream">
      {/* Background ambient decorative blurs */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-forest/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-gold/15 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-7xl flex-col lg:flex-row">
        {/* Left Side: Brand Story & Tourism Visual */}
        <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-forest px-8 py-12 text-cream lg:px-16 lg:py-20">
          <div className="absolute inset-0 opacity-30 mix-blend-overlay">
            <Image
              src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1600&q=80"
              alt="Highland scenery of Tupi"
              fill
              className="object-cover"
              priority
            />
          </div>
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
              <Sparkles size={14} /> Official Tourism Ecosystem
            </div>
            <h1 className="mt-6 font-serif text-4xl leading-tight md:text-5xl lg:text-6xl">
              Welcome back to <span className="text-gold italic">Tupi</span>.
            </h1>
            <p className="mt-4 max-w-md text-base text-cream/80 md:text-lg">
              Explore Mount Matutum highlands, fruit and flower plantations, eco-farms, and community rewards in South Cotabato.
            </p>
          </div>

          {/* Testimonial / Features Pill */}
          <div className="relative z-10 my-8 space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-cream/10 p-4 backdrop-blur-md">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold text-forest">
                <Compass size={20} />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-cream">Real Local Knowledge</p>
                <p className="text-cream/70">Verified operating hours, tricycle fare guidance, and real owner profiles.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-cream/10 p-4 backdrop-blur-md">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest">
                <ShieldCheck size={20} />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-cream">Tourism Board Supervised</p>
                <p className="text-cream/70">Official LGU and local business collaboration with genuine visitor rewards.</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 text-xs text-cream/60">
            © {new Date().getFullYear()} Tupi Tourism & Navigation System. Built for South Cotabato.
          </div>
        </div>

        {/* Right Side: Luxury Sign In Portal */}
        <div className="flex flex-1 items-center justify-center px-6 py-12 lg:px-16">
          <div className="w-full max-w-md">
            {/* Header */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-moss">Secure Portal</span>
              <h2 className="mt-1 font-serif text-3xl font-semibold text-forest">Sign in to your account</h2>
              <p className="mt-2 text-sm text-forest/70">
                New traveler or local host?{" "}
                <Link href="/register" className="font-semibold text-forest underline decoration-gold decoration-2 underline-offset-4 hover:text-gold-600">
                  Create free account
                </Link>
              </p>
            </div>

            {/* Quick Demo Switcher */}
            <div className="mt-6 rounded-2xl border border-forest/10 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-forest">
                  <UserCheck size={14} className="text-gold-600" /> 1-Click Demo Profiles
                </span>
                <span className="text-[11px] text-forest/60">Tap to auto-fill</span>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {DEMO_ACCOUNTS.map((demo) => (
                  <button
                    key={demo.role}
                    type="button"
                    onClick={() => fillDemo(demo.email, demo.password, demo.title)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition-all ${demo.accent}`}
                  >
                    <span className="text-xs font-bold">{demo.role}</span>
                    <span className="mt-0.5 text-[10px] opacity-80">{demo.badge}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                  Email Address
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={18} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-forest/15 bg-white py-3 pl-11 pr-4 text-sm text-ink placeholder:text-forest/40 transition focus:border-forest focus:ring-2 focus:ring-forest/20"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                    Password
                  </label>
                  <Link href="/forgot-password" className="text-xs text-moss hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-forest/15 bg-white py-3 pl-11 pr-11 text-sm text-ink placeholder:text-forest/40 transition focus:border-forest focus:ring-2 focus:ring-forest/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3.5 text-forest/40 hover:text-forest"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="group mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-forest py-3.5 text-sm font-semibold text-cream shadow-md transition-all hover:bg-forest-800 disabled:opacity-60"
              >
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-cream border-t-transparent" />
                    Signing in…
                  </span>
                ) : (
                  <>
                    Sign in to Tupi Tour
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>

            {/* Security note */}
            <div className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-forest/60">
              <ShieldCheck size={14} className="text-emerald-700" />
              <span>Encrypted JWT Sessions · Supabase & Render Ready</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
