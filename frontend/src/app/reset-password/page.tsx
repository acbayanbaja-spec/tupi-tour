"use client";

import { ArrowRight, CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

function ResetInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const token = params.get("token") || "";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      toast.error("Missing reset token. Please request a new link.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      toast.success("Password successfully updated! You can now sign in.");
      router.push("/login");
    } catch (err) {
      toast.error((err as Error).message || "Reset failed. The token may be expired.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-16">
      <div className="relative w-full max-w-md rounded-3xl border border-forest/10 bg-white/90 p-8 shadow-lift backdrop-blur-md">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest text-cream">
          <Lock size={24} />
        </div>

        <h1 className="mt-4 font-serif text-3xl font-semibold text-forest">Choose new password</h1>
        <p className="mt-2 text-sm text-forest/70">
          Set a secure password for your Tupi Tour account (minimum 8 characters).
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-forest/80">
              New Password
            </label>
            <div className="relative mt-1.5">
              <Lock className="pointer-events-none absolute left-3.5 top-3.5 text-forest/40" size={18} />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-xl border border-forest/15 bg-white py-3 pl-11 pr-4 text-sm text-ink placeholder:text-forest/40 transition focus:border-forest focus:ring-2 focus:ring-forest/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || !token}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-forest py-3.5 text-sm font-semibold text-cream shadow-md transition-all hover:bg-forest-800 disabled:opacity-60"
          >
            {busy ? "Updating Password…" : "Update Password & Sign In"}
            <ArrowRight size={16} />
          </button>
        </form>

        {!token && (
          <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
            No valid reset token found in URL. Please request a new link from the{" "}
            <Link href="/forgot-password" className="font-bold underline">
              forgot password page
            </Link>
            .
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
