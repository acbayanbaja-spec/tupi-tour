"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

export function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: Array<"tourist" | "owner" | "admin"> }) {
  const { user, loading } = useAuth();
  const path = usePathname();

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <div className="skeleton h-8 w-1/2" />
        <div className="skeleton mt-4 h-24" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-serif text-3xl text-forest">Sign in to continue</h1>
        <p className="mt-2 text-forest/70">Saved trips, rewards, and owner tools need an account.</p>
        <Link href={`/login?next=${encodeURIComponent(path)}`} className="mt-6 inline-block rounded-full bg-forest px-5 py-3 font-semibold text-cream">
          Sign in
        </Link>
      </div>
    );
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-serif text-3xl text-forest">This area is restricted</h1>
        <p className="mt-2 text-forest/70">Your account does not have access to this workspace.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-forest px-5 py-3 font-semibold text-cream">
          Back home
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
