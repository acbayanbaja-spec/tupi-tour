"use client";

import { ArrowLeft, ArrowRight, KeyRound, Mail, Sparkles } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ ok: boolean; resetToken?: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
      toast.success("If an account exists, a secure reset token has been issued.");
      if (data.resetToken) setToken(data.resetToken);
    } catch (err) {
      toast.error((err as Error).message || "Could not process request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-16">
      <div className="pointer-events-none absolute -left-20 top-20 h-72 w-72 rounded-full bg-forest/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-20 h-72 w-72 rounded-full bg-gold/15 blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-forest/10 bg-white/90 p-8 shadow-lift backdrop-blur-md">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-xs font-semibold text-forest/70 hover:text-forest">
          <ArrowLeft size={14} /> Back to Sign in
        </Link>

        <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-forest/10 text-forest">
          <KeyRound size={24} />
        </div>

        <h1 className="mt-4 font-serif text-3xl font-semibold text-forest">Reset your password</h1>
        <p className="mt-2 text-sm text-forest/70">
          Enter your registered email. We will generate a secure reset link for your account.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
              Registered Email
            </label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={18} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-xl border border-forest/15 bg-white py-3 pl-11 pr-4 text-sm text-ink placeholder:text-forest/40 transition focus:border-forest focus:ring-2 focus:ring-forest/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-forest py-3.5 text-sm font-semibold text-cream shadow-md transition-all hover:bg-forest-800 disabled:opacity-60"
          >
            {busy ? "Sending Instructions…" : "Send Reset Link"}
          </button>
        </form>

        {token && (
          <div className="mt-6 rounded-2xl border border-gold/30 bg-amber-50/80 p-4 text-xs text-amber-900">
            <p className="font-semibold flex items-center gap-1">
              <Sparkles size={14} /> Development / Testing Token
            </p>
            <p className="mt-1 break-all font-mono text-[11px] bg-white/70 p-2 rounded-lg border border-amber-200 mt-2">
              {token}
            </p>
            <Link
              href={`/reset-password?token=${token}`}
              className="mt-3 inline-flex items-center gap-1 font-bold text-forest underline hover:text-forest-800"
            >
              Continue to Choose New Password <ArrowRight size={12} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
