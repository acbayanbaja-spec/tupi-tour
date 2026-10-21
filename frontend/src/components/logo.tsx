import React from "react";
import Link from "next/link";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  inverted?: boolean;
}

export function TupiTourLogoIcon({ className = "h-9 w-9", size }: { className?: string; size?: number }) {
  const pixelSize = size || undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={pixelSize}
      height={pixelSize}
      className={`shrink-0 rounded-xl shadow-sm ${className}`}
      aria-hidden="true"
    >
      <defs>
        {/* Rich Highland Green Gradient matching AgriMarket + Tupi Highlands */}
        <linearGradient id="tupiBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f3b26" />
          <stop offset="50%" stop-color="#144d32" />
          <stop offset="100%" stop-color="#1b5e3d" />
        </linearGradient>

        <linearGradient id="tupiGoldGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#eab308" />
          <stop offset="50%" stop-color="#facc15" />
          <stop offset="100%" stop-color="#fef08a" />
        </linearGradient>

        <linearGradient id="tupiLeafGrad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#10b981" />
          <stop offset="100%" stop-color="#34d399" />
        </linearGradient>

        <filter id="tupiShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000000" flood-opacity="0.3" />
        </filter>
      </defs>

      {/* Squircle Badge */}
      <rect width="512" height="512" rx="112" ry="112" fill="url(#tupiBgGrad)" />

      {/* Subtle Inner Border */}
      <rect
        x="16"
        y="16"
        width="480"
        height="480"
        rx="98"
        ry="98"
        fill="none"
        stroke="#34d399"
        stroke-opacity="0.35"
        stroke-width="8"
      />

      {/* Golden Sunrise behind Matutum */}
      <circle cx="256" cy="220" r="105" fill="url(#tupiGoldGrad)" opacity="0.95" filter="url(#tupiShadow)" />

      {/* Distant Mountain Peak (Mt. Matutum backdrop) */}
      <path d="M120 370 L256 165 L392 370 Z" fill="#0d3120" opacity="0.75" />

      {/* Foreground Mountain Silhouette (White Crest) */}
      <path d="M140 370 L256 185 L372 370 Z" fill="#ffffff" filter="url(#tupiShadow)" />
      <path d="M256 185 L372 370 L256 370 Z" fill="#e2e8f0" />

      {/* Guiding North Star Flare at Peak */}
      <g transform="translate(256, 128)" fill="url(#tupiGoldGrad)">
        <path d="M0 -34 Q3 -8 18 -18 Q8 -3 34 0 Q8 3 18 18 Q3 8 0 34 Q-3 8 -18 18 Q-8 3 -34 0 Q-8 -3 -18 -18 Q-3 -8 0 -34 Z" />
        <circle cx="0" cy="0" r="4.5" fill="#ffffff" />
      </g>

      {/* Sprouting Twin Agri-Leaves / Pineapple Crown */}
      <g transform="translate(256, 375)">
        <path d="M0 -115 C0 -60 0 -10 0 10" stroke="#0f3b26" stroke-width="12" stroke-linecap="round" />
        <path d="M-6 -20 C-65 -45 -105 -105 -75 -155 C-45 -135 -15 -85 -6 -20 Z" fill="url(#tupiLeafGrad)" />
        <path d="M-6 -20 C-45 -60 -70 -110 -75 -155" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.6" />
        <path d="M6 -20 C65 -45 105 -105 75 -155 C45 -135 15 -85 6 -20 Z" fill="url(#tupiLeafGrad)" />
        <path d="M6 -20 C45 -60 70 -110 75 -155" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.6" />
        <path d="M0 -30 C-22 -75 -20 -130 0 -170 C20 -130 22 -75 0 -30 Z" fill="#ffffff" />
        <path d="M0 -30 L0 -160" stroke="#10b981" stroke-width="3.5" stroke-linecap="round" />
      </g>

      {/* Bottom Scenic Base */}
      <path d="M60 410 C160 380 352 380 452 410 C420 440 350 460 256 460 C162 460 92 440 60 410 Z" fill="#0b291a" />
    </svg>
  );
}

export function TupiTourLogo({
  className = "",
  size = "md",
  showText = true,
  inverted = false,
}: LogoProps) {
  const sizeMap = {
    sm: { icon: "h-7 w-7", title: "text-lg", sub: "text-[10px]" },
    md: { icon: "h-9 w-9", title: "text-xl", sub: "text-[11px]" },
    lg: { icon: "h-11 w-11", title: "text-2xl", sub: "text-xs" },
    xl: { icon: "h-14 w-14", title: "text-3xl", sub: "text-sm" },
  };

  const current = sizeMap[size];

  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 transition group ${className}`}
      aria-label="Tupi Tour Home"
    >
      <TupiTourLogoIcon className={current.icon} />
      {showText && (
        <div className="flex flex-col leading-none">
          <span
            className={`font-serif font-bold tracking-tight ${
              inverted ? "text-cream" : "text-forest"
            } ${current.title} group-hover:text-emerald-700 transition`}
          >
            Tupi Tour
          </span>
          <span
            className={`font-sans uppercase tracking-[0.18em] font-semibold ${
              inverted ? "text-gold" : "text-moss"
            } ${current.sub}`}
          >
            South Cotabato
          </span>
        </div>
      )}
    </Link>
  );
}
