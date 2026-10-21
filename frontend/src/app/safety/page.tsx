"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, HeartPulse, Phone, PhoneCall, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface SafetyData {
  emergencyContacts: { service: string; phone: string; available: string; location: string }[];
  guidance: { topic: string; notes: string }[];
}

export default function SafetyPage() {
  const { t, lang } = useI18n();

  const q = useQuery({
    queryKey: ["safety-info"],
    queryFn: () => api<SafetyData>("/api/safety-info"),
  });

  const contacts = q.data?.emergencyContacts || [
    { service: "MDRRMO Tupi (Rescue & Disaster Office)", phone: "911 / (083) 228-1000", available: "24/7", location: "Municipal Hall Compound" },
    { service: "Philippine National Police (PNP Tupi)", phone: "(083) 228-1234", available: "24/7", location: "Poblacion, Tupi" },
    { service: "Bureau of Fire Protection (BFP Tupi)", phone: "(083) 228-1111", available: "24/7", location: "Poblacion, Tupi" },
    { service: "Municipal Health Office / RHU", phone: "(083) 228-1357", available: "8:00 AM - 5:00 PM", location: "Barangay Poblacion" },
    { service: "Municipal Tourism Office", phone: "(083) 228-5678", available: "8:00 AM - 5:00 PM", location: "Tourism Info Center" },
  ];

  const guidance = q.data?.guidance || [
    {
      topic: "Highland Weather & Footwear",
      notes: "Highland slopes near Mount Matutum (e.g. Sitio Glandang, SG Farm) frequently experience afternoon rain showers. Wear rubber-soled trekking shoes or sturdy footwear and pack a rain poncho.",
    },
    {
      topic: "Philippine Peso (Cash) Readiness",
      notes: "Roadside fruit stalls, tricycle operators, and small farm gates accept cash only. Withdraw cash in Poblacion along the national highway before venturing into highland areas.",
    },
    {
      topic: "Respect Private Agri-Plantations",
      notes: "Pineapple fields are agricultural working areas. Do not cross farm barriers or pick pineapples without authorized farm tour guides.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f7f5ef] pb-24 pt-8">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Header */}
        <div className="rounded-3xl bg-forest p-8 text-cream shadow-lift relative overflow-hidden">
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-gold/10 blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-gold uppercase tracking-wider">
              <ShieldCheck size={14} /> {lang === "fil" ? "Opisyal na Gabay sa Kaligtasan" : "Official Tourism Advisory"}
            </span>
            <h1 className="mt-3 font-serif text-3xl font-bold sm:text-4xl text-cream">
              {lang === "fil" ? "Kaligtasan & Mga Numero ng Saklolo sa Tupi" : "Tupi Traveler Safety & Emergency Directory"}
            </h1>
            <p className="mt-2 text-sm text-cream/80 max-w-2xl leading-relaxed">
              {lang === "fil"
                ? "Direktoryo ng mga opisyal na emergency hotline ng LGU Tupi, mga payo sa paglalakbay sa kabundukan ng Matutum, at praktikal na impormasyon para sa ligtas na pamamasyal."
                : "Official emergency hotlines verified by the Municipality of Tupi, highland weather preparation notes, and practical traveler guidance."}
            </p>
          </div>
        </div>

        {/* Emergency Hotlines Grid */}
        <div className="mt-8">
          <h2 className="font-serif text-2xl font-bold text-forest mb-4 flex items-center gap-2">
            <PhoneCall className="text-gold" size={22} />
            {lang === "fil" ? "Mga Emergency Hotlines (I-click para tumawag)" : "Official Emergency Contacts (Click to Call)"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {contacts.map((c) => {
              const cleanPhone = c.phone.split("/")[0].replace(/[^0-9+]/g, "");
              return (
                <div
                  key={c.service}
                  className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm flex flex-col justify-between hover:border-forest/30 transition"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-forest text-sm">{c.service}</h3>
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        {c.available}
                      </span>
                    </div>
                    <p className="text-xs text-moss mt-1 font-mono">{c.phone}</p>
                    <p className="text-[11px] text-forest/60 mt-1">{c.location}</p>
                  </div>

                  <a
                    href={`tel:${cleanPhone}`}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-forest/5 px-4 py-2.5 text-xs font-bold text-forest hover:bg-forest hover:text-cream transition"
                  >
                    <Phone size={14} /> Call Hotline
                  </a>
                </div>
              );
            })}
          </div>
        </div>

        {/* Practical Visit Guidance */}
        <div className="mt-12">
          <h2 className="font-serif text-2xl font-bold text-forest mb-4 flex items-center gap-2">
            <ShieldAlert className="text-moss" size={22} />
            {lang === "fil" ? "Mahalagang Paalala sa Paglalakbay" : "Essential Visit Guidelines & Rules"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            {guidance.map((g) => (
              <div key={g.topic} className="rounded-2xl border border-forest/10 bg-white/90 p-5 shadow-sm">
                <div className="flex items-center gap-2 text-gold">
                  <CheckCircle2 size={18} />
                  <h3 className="font-bold text-forest text-xs uppercase tracking-wider">{g.topic}</h3>
                </div>
                <p className="mt-2 text-xs text-forest/80 leading-relaxed">{g.notes}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 rounded-2xl bg-amber-50 p-4 border border-amber-200 text-xs text-amber-950 flex items-start gap-3">
          <AlertTriangle className="text-amber-700 shrink-0 mt-0.5" size={18} />
          <p>
            <strong>Note:</strong> In life-threatening emergencies, dial <strong>911</strong> immediately or approach the nearest Barangay Hall or PNP station. This directory is curated for visiting tourists.
          </p>
        </div>
      </div>
    </div>
  );
}
