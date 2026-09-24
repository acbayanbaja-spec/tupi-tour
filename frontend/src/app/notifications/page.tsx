"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Award,
  Bell,
  Check,
  CheckCircle2,
  Gift,
  Info,
  MapPin,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { api } from "@/lib/api";

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsList />
    </RequireAuth>
  );
}

function NotificationsList() {
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api<{ notifications: { id: string; title: string; body: string; type: string; read: boolean; createdAt: string }[] }>("/api/notifications"),
  });

  async function mark(id?: string) {
    await api("/api/notifications/read", { method: "POST", body: JSON.stringify({ id }) });
    toast.success(id ? "Marked as read" : "All notifications marked as read");
    q.refetch();
  }

  const unreadCount = q.data?.notifications.filter((n) => !n.read).length || 0;

  function getIcon(type: string) {
    switch (type) {
      case "reward":
        return <Gift size={18} className="text-amber-600" />;
      case "badge":
        return <Award size={18} className="text-gold-600" />;
      case "visit":
        return <MapPin size={18} className="text-emerald-600" />;
      default:
        return <Sparkles size={18} className="text-forest" />;
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5ef] pb-24">
      {/* Header */}
      <div className="border-b border-forest/10 bg-white/70 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-moss">Inbox</span>
              <h1 className="mt-1 font-serif text-3xl font-bold text-forest sm:text-4xl">Notifications</h1>
              <p className="mt-1 text-xs text-forest/70">
                {unreadCount > 0 ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}` : "All caught up"}
              </p>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => mark()}
                className="flex items-center gap-1.5 rounded-full border border-forest/15 bg-white px-4 py-2 text-xs font-semibold text-forest hover:bg-cream shadow-sm"
              >
                <Check size={14} /> Mark all as read
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 space-y-3">
        {q.data?.notifications.map((n) => (
          <div
            key={n.id}
            className={`flex items-start justify-between gap-4 rounded-2xl border p-4.5 transition ${
              n.read ? "border-forest/5 bg-white/70" : "border-forest/15 bg-white shadow-sm ring-1 ring-forest/5"
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream">
                {getIcon(n.type)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif text-base font-bold text-forest">{n.title}</h3>
                  {!n.read && (
                    <span className="h-2 w-2 rounded-full bg-gold" />
                  )}
                </div>
                <p className="mt-1 text-xs text-forest/75 leading-relaxed">{n.body}</p>
                <span className="mt-2 block text-[10px] text-forest/45">
                  {new Date(n.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} at{" "}
                  {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>

            {!n.read && (
              <button
                type="button"
                onClick={() => mark(n.id)}
                className="shrink-0 text-xs font-semibold text-forest/60 hover:text-forest"
                title="Mark read"
              >
                Mark read
              </button>
            )}
          </div>
        ))}

        {!q.data?.notifications.length && (
          <div className="rounded-3xl border border-forest/10 bg-white p-12 text-center text-forest/60">
            <Bell size={32} className="mx-auto opacity-30" />
            <h3 className="mt-3 font-serif text-lg font-bold text-forest">No notifications</h3>
            <p className="mt-1 text-xs text-forest/60">We'll alert you here when you earn badges, rewards, or spot updates.</p>
          </div>
        )}
      </main>
    </div>
  );
}
