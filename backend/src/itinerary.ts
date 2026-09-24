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
}

function pickSpots(input: PlannerInput) {
  const origin = {
    lat: input.startLat ?? 6.3347,
    lng: input.startLng ?? 124.9669,
  };
  const cats = store.categories().filter((c) => input.interests.includes(c.slug) || input.interests.includes(c.id));
  const catIds = new Set(cats.map((c) => c.id));
  const maxStops = input.hours <= 4 ? 3 : input.hours <= 8 ? 5 : 6;
  const ranked = store
    .spots("approved")
    .map((s) => {
      let score = s.popularityScore - haversineKm(origin, s) * 2;
      if (catIds.size && catIds.has(s.categoryId)) score += 20;
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

export async function buildItinerary(input: PlannerInput) {
  const { origin, ranked } = pickSpots(input);
  const transportRate = { tricycle: 40, motorcycle: 25, car: 18, jeepney: 12 }[input.transport];
  let cursor = 8 * 60;
  const blocks: {
    time: string;
    title: string;
    kind: "spot" | "break" | "return";
    minutes: number;
    spot?: ReturnType<typeof enrichSpot>;
    note: string;
  }[] = [];
  let last = origin;
  let travelKm = 0;
  ranked.forEach((spot, i) => {
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
      spot: enrichSpot(spot, input.userId, origin),
      note: `About ${km.toFixed(1)} km from the previous stop. Stay is estimated.`,
    });
    cursor += stay;
    if (i === 1 || (i === 3 && ranked.length > 4)) {
      const lunchH = String(Math.floor(cursor / 60)).padStart(2, "0");
      const lunchM = String(cursor % 60).padStart(2, "0");
      blocks.push({
        time: `${lunchH}:${lunchM}`,
        title: "Meal break (local eatery or fruit stop)",
        kind: "break",
        minutes: 45,
        note: "Food cost is an estimate only — Tupi prices vary by stall.",
      });
      cursor += 45;
    }
    last = spot;
  });
  const back = haversineKm(last, origin);
  travelKm += back;
  const backMin = Math.max(15, Math.round((back / 28) * 60));
  cursor += backMin;
  blocks.push({
    time: `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`,
    title: "Return toward starting point",
    kind: "return",
    minutes: backMin,
    note: "Return time is estimated from road distance, not live traffic.",
  });

  const transportCost = Math.round(travelKm * transportRate * Math.max(1, Math.ceil(input.travelers / 3)));
  const food = 180 * input.travelers;
  const fees = ranked.reduce((sum, s) => sum + (s.estimatedEntranceFee || 0), 0) * input.travelers;
  const total = transportCost + food + fees;
  const over = total > input.budget;

  const stops = ranked.map((s) => s.name).join(", ");
  const aiNotes = [
    `Suggested stops: ${stops || "Tupi town proper and nearby farms"}.`,
    "Bring water, cash for fruit stalls, and a light jacket for Kablon.",
    "Confirm farm hours before riding up — highland weather can close access.",
    "Treat travel times as road-distance estimates, not live traffic.",
  ].join(" ");

  return {
    title: input.hours <= 5 ? "Tupi half-day" : "Tupi day trip",
    generatedAt: new Date().toISOString(),
    assumptions: [
      "Travel times use estimated road distance, not live Google traffic.",
      "Entrance fees are labeled estimates when present; many venues must be confirmed on site.",
      "Operating hours in this catalog are not a live business feed.",
    ],
    schedule: blocks,
    alternatives: store
      .spots("approved")
      .filter((s) => !ranked.some((r) => r.id === s.id))
      .slice(0, 3)
      .map((s) => enrichSpot(s, input.userId, origin)),
    budget: {
      currency: "PHP",
      estimated: true,
      transportation: transportCost,
      food,
      entranceFees: fees,
      other: 50 * input.travelers,
      total: total + 50 * input.travelers,
      withinBudget: !over,
      note: over
        ? "The rough total is above your stated budget. Drop a far highland stop or share a tricycle."
        : "This rough total is within your stated budget, still confirm on-site costs.",
    },
    aiNotes,
  };
}
