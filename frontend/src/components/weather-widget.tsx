"use client";

import { useQuery } from "@tanstack/react-query";
import { Cloud, CloudRain, Sun, Wind } from "lucide-react";
import { api, type WeatherForecast } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export function WeatherWidget({ className = "" }: { className?: string }) {
  const { t } = useI18n();

  const q = useQuery({
    queryKey: ["tupi-weather"],
    queryFn: () => api<WeatherForecast>("/api/weather"),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  if (q.isLoading) {
    return (
      <div className={`animate-pulse rounded-2xl bg-forest/5 p-4 border border-forest/10 ${className}`}>
        <div className="h-4 w-32 bg-forest/10 rounded mb-2" />
        <div className="h-6 w-20 bg-forest/10 rounded" />
      </div>
    );
  }

  if (!q.data) {
    return null;
  }

  const { current, daily, advisory } = q.data;

  return (
    <div className={`overflow-hidden rounded-2xl border border-forest/15 bg-white/80 p-5 shadow-sm backdrop-blur-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-forest/10 text-forest">
            {current.isRainy ? (
              <CloudRain size={26} className="text-blue-600" />
            ) : current.tempC >= 30 ? (
              <Sun size={26} className="text-amber-500" />
            ) : (
              <Cloud size={26} className="text-emerald-700" />
            )}
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-3xl font-bold text-forest">{current.tempC}°C</span>
              <span className="text-xs text-forest/70 font-medium">Feels like {current.feelsLikeC}°C</span>
            </div>
            <p className="text-xs font-semibold text-moss">{current.condition} · Tupi, South Cotabato</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-forest/70">
          <div className="flex items-center gap-1">
            <Wind size={14} className="text-moss" />
            <span>{current.windKmh} km/h</span>
          </div>
          <div className="flex items-center gap-1">
            <span>💧 {current.humidity}%</span>
          </div>
        </div>
      </div>

      {/* Advisory Banner */}
      {advisory && (
        <div className="mt-4 rounded-xl bg-emerald-50/80 p-3 text-xs text-emerald-950 border border-emerald-200/60 leading-relaxed">
          <span className="font-bold text-emerald-900 uppercase tracking-wider text-[10px] block mb-0.5">
            🏔️ {t("weather.advisory")}
          </span>
          {advisory}
        </div>
      )}

      {/* 3-Day Forecast */}
      {daily && daily.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-forest/10 pt-3">
          {daily.slice(0, 3).map((d) => (
            <div key={d.date} className="rounded-lg bg-cream/50 p-2 text-center text-xs">
              <span className="text-[10px] font-bold text-forest/60 block">
                {new Date(d.date).toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span className="font-bold text-forest block mt-0.5">{d.tempMaxC}°</span>
              <span className="text-[10px] text-moss block truncate">{d.condition}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
