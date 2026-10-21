"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Language = "en" | "fil";

const translations = {
  en: {
    "nav.home": "Home",
    "nav.explore": "Explore",
    "nav.map": "Map",
    "nav.planner": "Trip Planner",
    "nav.trips": "My Trips",
    "nav.favorites": "Favorites",
    "nav.rewards": "Rewards",
    "nav.routes": "Routes",
    "nav.safety": "Safety & Emergency",
    "nav.admin": "Admin Portal",
    "nav.owner": "Host Workspace",
    "search.placeholder": "Search spots, farms, fruit parks…",
    "search.quickMatches": "Quick Matches",
    "auth.signIn": "Sign In",
    "auth.signOut": "Sign Out",
    "auth.register": "Create Account",
    "status.offline": "Offline Mode Active",
    "status.offlineDesc": "Showing cached destinations. Live maps and AI require connection.",
    "verified.badge": "Verified by Municipal Tourism",
    "verified.outdated": "Needs Verification",
    "verified.lastChecked": "Last checked",
    "weather.title": "Tupi Highland Weather",
    "weather.advisory": "Travel Advisory",
    "safety.title": "Tourist Safety & Emergency Contacts",
    "vouchers.title": "My Travel Vouchers",
    "vouchers.empty": "No vouchers claimed yet. Redeem points for authentic local perks!",
    "vouchers.verifyBtn": "Verify Voucher Code",
  },
  fil: {
    "nav.home": "Tahanan",
    "nav.explore": "Tuklasin",
    "nav.map": "Mapa",
    "nav.planner": "Plano ng Biyahe",
    "nav.trips": "Mga Biyahe Ko",
    "nav.favorites": "Mga Paborito",
    "nav.rewards": "Gantimpala",
    "nav.routes": "Mga Ruta",
    "nav.safety": "Kaligtasan & Saklolo",
    "nav.admin": "Portal ng Admin",
    "nav.owner": "Tahanan ng May-ari",
    "search.placeholder": "Maghanap ng mga pasyalan, bukid, prutasan…",
    "search.quickMatches": "Mabilis na Tugma",
    "auth.signIn": "Mag-sign In",
    "auth.signOut": "Mag-sign Out",
    "auth.register": "Lumikha ng Account",
    "status.offline": "Naka-offline ang Koneksyon",
    "status.offlineDesc": "Ipinapakita ang naka-cache na mga lugar. Ang live na mapa at AI ay nangangailangan ng internet.",
    "verified.badge": "Beripikado ng Turismo ng Munisipyo",
    "verified.outdated": "Kailangang Kumpirmahin",
    "verified.lastChecked": "Huling nasuri",
    "weather.title": "Panahon sa Kabundukan ng Tupi",
    "weather.advisory": "Payo sa Manlalakbay",
    "safety.title": "Kaligtasan ng Turista & Mga Numero ng Saklolo",
    "vouchers.title": "Aking mga Voucher sa Paglalakbay",
    "vouchers.empty": "Wala pang nakuhang voucher. Mag-redeem ng points para sa mga lokal na diskwento!",
    "vouchers.verifyBtn": "Suriin ang Kodigo ng Voucher",
  },
};

type I18nContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof typeof translations.en) => string;
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  useEffect(() => {
    const saved = localStorage.getItem("tupi_lang") as Language;
    if (saved === "en" || saved === "fil") {
      setLangState(saved);
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem("tupi_lang", newLang);
  };

  const t = (key: keyof typeof translations.en): string => {
    return translations[lang]?.[key] || translations.en[key] || key;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      lang: "en" as Language,
      setLang: () => {},
      t: (key: keyof typeof translations.en) => translations.en[key] || key,
    };
  }
  return ctx;
}
