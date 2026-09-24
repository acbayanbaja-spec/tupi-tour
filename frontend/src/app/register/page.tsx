"use client";

import { ArrowRight, Compass, Eye, EyeOff, Lock, Mail, Store, User, Sparkles, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"tourist" | "owner">("tourist");
  const [busy, setBusy] = useState(false);

  // Password strength score 0 to 4
  const hasMinLength = password.length >= 8;
  const hasNumberOrSpecial = /[0-9!@#$%^&*]/.test(password);
  const hasLetter = /[a-zA-Z]/.test(password);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasMinLength) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }
    setBusy(true);
    try {
      await register({ name, email, password, role });
      toast.success("Account created successfully! Welcome to Tupi.");
      if (role === "owner") {
        router.push("/owner");
      } else {
        router.push("/onboarding");
      }
    } catch (err) {
      toast.error((err as Error).message || "Registration failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-64px)] w-full overflow-hidden bg-cream">
      {/* Decorative background glow */}
      <div className="pointer-events-none absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-gold/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 -top-40 h-96 w-96 rounded-full bg-forest/10 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-7xl flex-col lg:flex-row">
        {/* Left Side: Storytelling & Highlands */}
        <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-forest px-8 py-12 text-cream lg:px-16 lg:py-20">
          <div className="absolute inset-0 opacity-25 mix-blend-overlay">
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
              <Sparkles size={14} /> Join Tupi Tourism
            </div>
            <h1 className="mt-6 font-serif text-4xl leading-tight md:text-5xl lg:text-6xl">
              Start your journey across <span className="text-gold italic">Tupi</span>.
            </h1>
            <p className="mt-4 max-w-md text-base text-cream/80 md:text-lg">
              Unlock personalized itineraries, verified farm locations, fruit picking tips, and authentic visitor points.
            </p>
          </div>

          <div className="relative z-10 my-8 space-y-3">
            <div className="rounded-2xl bg-cream/10 p-4 backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-wider text-gold">For Travelers & Explorers</p>
              <p className="mt-1 text-xs text-cream/80">Save trips, calculate realistic tricycle fares, bookmark destinations, and collect points for rewards.</p>
            </div>
            <div className="rounded-2xl bg-cream/10 p-4 backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-wider text-gold">For Farm & Spot Owners</p>
              <p className="mt-1 text-xs text-cream/80">Submit your eco-park, highland retreat, or fruit stand for review and connect directly with visitors.</p>
            </div>
          </div>

          <div className="relative z-10 text-xs text-cream/60">
            © {new Date().getFullYear()} Tupi Tourism Council & Municipal Tourism Development.
          </div>
        </div>

        {/* Right Side: Registration Form */}
        <div className="flex flex-1 items-center justify-center px-6 py-12 lg:px-16">
          <div className="w-full max-w-md">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-moss">Create Account</span>
              <h2 className="mt-1 font-serif text-3xl font-semibold text-forest">Get started in seconds</h2>
              <p className="mt-2 text-sm text-forest/70">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-forest underline decoration-gold decoration-2 underline-offset-4 hover:text-gold-600">
                  Sign in
                </Link>
              </p>
            </div>

            {/* Account Type Selector Cards */}
            <div className="mt-6">
              <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                I want to join as:
              </label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("tourist")}
                  className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                    role === "tourist"
                      ? "border-forest bg-forest/5 ring-2 ring-forest/20"
                      : "border-forest/15 bg-white hover:border-forest/30"
                  }`}
                >
                  <div className={`rounded-xl p-2 ${role === "tourist" ? "bg-forest text-cream" : "bg-forest/10 text-forest"}`}>
                    <Compass size={18} />
                  </div>
                  <span className="mt-2 text-sm font-bold text-forest">Tourist</span>
                  <span className="text-[11px] text-forest/65">Explore, plan & earn</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("owner")}
                  className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                    role === "owner"
                      ? "border-forest bg-forest/5 ring-2 ring-forest/20"
                      : "border-forest/15 bg-white hover:border-forest/30"
                  }`}
                >
                  <div className={`rounded-xl p-2 ${role === "owner" ? "bg-gold text-forest" : "bg-gold/15 text-gold-600"}`}>
                    <Store size={18} />
                  </div>
                  <span className="mt-2 text-sm font-bold text-forest">Spot Owner</span>
                  <span className="text-[11px] text-forest/65">List farm or business</span>
                </button>
              </div>
            </div>

            {/* Registration Form */}
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                  Full Name
                </label>
                <div className="relative mt-1.5">
                  <User className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={18} />
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={role === "owner" ? "Juan Dela Cruz (Business Representative)" : "Ana Explorer"}
                    className="w-full rounded-xl border border-forest/15 bg-white py-3 pl-11 pr-4 text-sm text-ink placeholder:text-forest/40 transition focus:border-forest focus:ring-2 focus:ring-forest/20"
                  />
                </div>
              </div>

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
                <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
                  Password
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
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
                {/* Visual strength bar */}
                {password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1.5">
                      <div className={`h-1.5 flex-1 rounded-full ${hasMinLength ? "bg-emerald-500" : "bg-rose-400"}`} />
                      <div className={`h-1.5 flex-1 rounded-full ${hasNumberOrSpecial ? "bg-emerald-500" : "bg-forest/15"}`} />
                      <div className={`h-1.5 flex-1 rounded-full ${hasLetter ? "bg-emerald-500" : "bg-forest/15"}`} />
                    </div>
                    <p className="text-[11px] text-forest/60">
                      {!hasMinLength ? "Need at least 8 characters" : "Good password length"}
                    </p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={busy}
                className="group mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-forest py-3.5 text-sm font-semibold text-cream shadow-md transition-all hover:bg-forest-800 disabled:opacity-60"
              >
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-cream border-t-transparent" />
                    Creating account…
                  </span>
                ) : (
                  <>
                    Complete Registration
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-forest/60">
              <ShieldCheck size={14} className="text-emerald-700" />
              <span>By registering, you agree to Tupi Tourism's Community Standards.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
