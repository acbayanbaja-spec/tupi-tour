import { config } from "./config.js";
import { enrichSpot, haversineKm } from "./geo.js";
import { store } from "./store.js";

export interface PlannerInput {
  hours: number;
  budget: number;
  interests: string[];
  travelers: number;
  startLat?: number;
  startLng?: number;
  transport: "tricycle" | "motorcycle" | "car" | "jeepney";
  intensity: "easy" | "moderate" | "active";
  userId?: string;
  travelDate?: string;
}

async function pickSpots(input: PlannerInput) {
  const origin = {
    lat: input.startLat ?? 6.3347,
    lng: input.startLng ?? 124.9669,
  };
  const allCategories = await store.categories();
  const cats = allCategories.filter((c) => input.interests.includes(c.slug) || input.interests.includes(c.id));
  const catIds = new Set(cats.map((c) => c.id));
  const maxStops = input.hours <= 4 ? 3 : input.hours <= 8 ? 5 : 6;

  const allApproved = await store.spots("approved");
  const ranked = allApproved
    .map((s) => {
      let score = s.popularityScore - haversineKm(origin, s) * 2;
      if (catIds.size && catIds.has(s.categoryId)) score += 25;
      if (input.intensity === "easy" && s.categoryId === "cat-nature") score -= 8;
      if (input.intensity === "active" && s.categoryId === "cat-nature") score += 10;
      return { s, score, km: haversineKm(origin, s) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxStops)
    .sort((a, b) => a.km - b.km)
    .map((x) => x.s);

  return { origin, ranked };
}

async function generateAiItineraryNotes(rankedNames: string[], input: PlannerInput): Promise<string> {
  const prompt = `You are the Tupi Tour AI Assistant for Tupi, South Cotabato, Philippines.
The traveler has requested a ${input.hours}-hour trip with ${input.travelers} traveler(s), traveling via ${input.transport} at a ${input.intensity} pace.
Their budget is PHP ${input.budget}.
Planned stops from the verified municipal catalog: ${rankedNames.join(", ")}.

Provide 2-3 concise, practical sentences with authentic local tips for Tupi:
- Remind about cash for roadside fruit stalls in Kablon
- Advise on mountain weather / light jacket for Mt. Matutum foothill farms
- Highlight entrance fee confirmation on site.
Do not invent fictional destinations.`;

  try {
    if (config.groqKey) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4500);
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 150,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok) {
        const d = (await res.json()) as any;
        const text = d.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    }
  } catch {
    // Fall through to deterministic fallback
  }

  return `Planned stops: ${rankedNames.join(", ") || "Tupi town proper and highland farms"}. Bring cash for fruit stalls along the Kablon highway and a light jacket for Mt. Matutum foothill breezes. Always confirm farm operating hours on-site before heading uphill.`;
}

export async function buildItinerary(input: PlannerInput) {
  const { origin, ranked } = await pickSpots(input);
  const transportRate = { tricycle: 40, motorcycle: 25, car: 18, jeepney: 12 }[input.transport];
  let cursor = 8 * 60; // 08:00 AM start

  const blocks: {
    time: string;
    title: string;
    kind: "spot" | "break" | "return";
    minutes: number;
    spot?: any;
    note: string;
  }[] = [];

  let last = origin;
  let travelKm = 0;

  for (let i = 0; i < ranked.length; i++) {
    const spot = ranked[i];
    const km = haversineKm(last, spot);
    travelKm += km;
    const ride = Math.max(12, Math.round((km / 28) * 60));
    cursor += ride;
    const stay = input.intensity === "easy" ? 50 : input.intensity === "active" ? 80 : 65;
    const hh = String(Math.floor(cursor / 60)).padStart(2, "0");
    const mm = String(cursor % 60).padStart(2, "0");

    blocks.push({
      time: `${hh}:${mm}`,
      title: spot.name,
      kind: "spot",
      minutes: stay,
      spot: await enrichSpot(spot, input.userId, origin),
      note: `About ${km.toFixed(1)} km from previous point. Stay duration is an estimate.`,
    });

    cursor += stay;

    if (i === 1 || (i === 3 && ranked.length > 4)) {
      const lunchH = String(Math.floor(cursor / 60)).padStart(2, "0");
      const lunchM = String(cursor % 60).padStart(2, "0");
      blocks.push({
        time: `${lunchH}:${lunchM}`,
        title: "Meal or Fruit Break (Kablon roadside / local eatery)",
        kind: "break",
        minutes: 45,
        note: "Estimated food expense is PHP 180 per traveler. Local fruit prices vary by stall.",
      });
      cursor += 45;
    }
    last = spot;
  }

  const back = haversineKm(last, origin);
  travelKm += back;
  const backMin = Math.max(15, Math.round((back / 28) * 60));
  cursor += backMin;

  blocks.push({
    time: `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`,
    title: "Return toward starting point / Poblacion",
    kind: "return",
    minutes: backMin,
    note: "Return time is estimated from road distance, not real-time highway congestion.",
  });

  const transportCost = Math.round(travelKm * transportRate * Math.max(1, Math.ceil(input.travelers / 3)));
  const food = 180 * input.travelers;
  const fees = ranked.reduce((sum, s) => sum + (s.estimatedEntranceFee || 0), 0) * input.travelers;
  const other = 50 * input.travelers;

  // PHASE 3.4 FIX: Consistent budget calculation including "other" expense!
  const total = transportCost + food + fees + other;
  const over = total > input.budget;
  const withinBudget = !over;

  const rankedNames = ranked.map((s) => s.name);
  const aiNotes = await generateAiItineraryNotes(rankedNames, input);

  const allApproved = await store.spots("approved");
  const alternativesRaw = allApproved
    .filter((s) => !ranked.some((r) => r.id === s.id))
    .slice(0, 3);
  const alternatives = await Promise.all(
    alternativesRaw.map((s) => enrichSpot(s, input.userId, origin))
  );

  return {
    title: input.hours <= 5 ? "Tupi Half-Day Adventure" : "Tupi Full-Day Experience",
    generatedAt: new Date().toISOString(),
    assumptions: [
      "Travel times use estimated road distance, not live GPS traffic sensors.",
      "Entrance fees are verified catalog estimates; some private venues adjust fees seasonally.",
      "Operating hours reflect reported farm and roadside schedules.",
    ],
    schedule: blocks,
    alternatives,
    budget: {
      currency: "PHP",
      estimated: true,
      transportation: transportCost,
      food,
      entranceFees: fees,
      other,
      total,
      withinBudget,
      note: over
        ? `The estimated total of ₱${total.toLocaleString()} is above your stated budget of ₱${input.budget.toLocaleString()}. Consider sharing transport or reducing one highland stop.`
        : `This rough total of ₱${total.toLocaleString()} is within your stated budget of ₱${input.budget.toLocaleString()}. Keep extra cash for local fruit purchases.`,
    },
    aiNotes,
  };
}
