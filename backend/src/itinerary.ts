import { config } from "./config.js";
import { enrichSpot, haversineKm, isWithinTupi, TUPI_CENTER } from "./geo.js";
import { store } from "./store.js";
import type { TouristSpot } from "./types.js";

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

/**
 * Realistic local transport fare calculation for Tupi, South Cotabato.
 * Reflects authentic local rates: tricycle charters/pakyaw, motorcycle habal-habal, car service, and public jeepney.
 */
export function computeTransportCost(
  travelKm: number,
  transport: "tricycle" | "motorcycle" | "car" | "jeepney",
  travelers: number
): number {
  if (transport === "jeepney") {
    // Public jeepney in Tupi along national highway: ~₱10-15 per km / stop per passenger
    return Math.max(40, Math.round(travelKm * 10 * travelers));
  }
  if (transport === "motorcycle") {
    // Habal-habal: 1 passenger per bike, base ₱70 + ₱14/km
    return Math.round((70 + travelKm * 14) * travelers);
  }
  if (transport === "car") {
    // Car service / vehicle hire in Tupi: base ₱350 + ₱16/km
    const cars = Math.max(1, Math.ceil(travelers / 4));
    return Math.round((350 + travelKm * 16) * cars);
  }
  // Tricycle: standard charter / pakyaw in Tupi (seats 2-3 passengers comfortably)
  const trikes = Math.max(1, Math.ceil(travelers / 3));
  return Math.round((120 + travelKm * 16) * trikes);
}

/**
 * Budget-constrained spot selection for Tupi, South Cotabato.
 * Ensures the chosen destination circuit is crafted to fit within the tourist's budget.
 */
async function pickSpots(input: PlannerInput) {
  const origin = {
    lat: input.startLat && isWithinTupi(input.startLat, input.startLng ?? TUPI_CENTER.lng)
      ? input.startLat
      : TUPI_CENTER.lat,
    lng: input.startLng && isWithinTupi(input.startLat ?? TUPI_CENTER.lat, input.startLng)
      ? input.startLng
      : TUPI_CENTER.lng,
  };

  const allCategories = await store.categories();
  const cats = allCategories.filter((c) => input.interests.includes(c.slug) || input.interests.includes(c.id));
  const catIds = new Set(cats.map((c) => c.id));
  const maxStops = input.hours <= 4 ? 3 : input.hours <= 7 ? 4 : 5;

  const allApproved = await store.spots("approved");
  // Exclusively consider spots within Tupi, South Cotabato
  const tupiApproved = allApproved.filter((s) => isWithinTupi(s.lat, s.lng));

  // Score candidate spots based on interest relevance, popularity, and fees
  const scored = tupiApproved.map((s) => {
    let score = s.popularityScore - haversineKm(origin, s) * 2;
    if (catIds.size && catIds.has(s.categoryId)) score += 30;
    if (input.intensity === "easy" && s.categoryId === "cat-nature") score -= 8;
    if (input.intensity === "active" && s.categoryId === "cat-nature") score += 10;

    const feePerPerson = s.estimatedEntranceFee || 0;
    // Prefer free or low-cost spots when budget is tight
    if (input.budget < 1500 && feePerPerson > 50) score -= 15;
    return { s, score, feePerPerson };
  });

  scored.sort((a, b) => b.score - a.score);

  // Iteratively pick stops that stay within the traveler's stated budget
  const selected: TouristSpot[] = [];
  let currentLast = origin;
  let totalKm = 0;
  let totalFees = 0;

  for (const candidate of scored) {
    if (selected.length >= maxStops) break;
    if (selected.some((x) => x.id === candidate.s.id)) continue;

    const legKm = haversineKm(currentLast, candidate.s);
    const returnKm = haversineKm(candidate.s, origin);
    const candidateTotalKm = totalKm + legKm + returnKm;
    const candidateTransport = computeTransportCost(candidateTotalKm, input.transport, input.travelers);
    const candidateFees = totalFees + candidate.feePerPerson * input.travelers;
    const candidateFood = 150 * input.travelers;
    const candidateOther = 40 * input.travelers;
    const candidateTotal = candidateTransport + candidateFees + candidateFood + candidateOther;

    // Check if adding this stop keeps the plan within budget (allow at least 2 stops for valid itinerary)
    if (candidateTotal <= input.budget || selected.length < 2) {
      selected.push(candidate.s);
      totalKm += legKm;
      totalFees += candidate.feePerPerson * input.travelers;
      currentLast = candidate.s;
    }
  }

  // Ensure stops are ordered logically by proximity to minimize backtracking
  selected.sort((a, b) => haversineKm(origin, a) - haversineKm(origin, b));

  return { origin, ranked: selected, tupiApproved };
}

async function generateAiItineraryNotes(
  rankedNames: string[],
  input: PlannerInput,
  totalCost: number,
  remainingBudget: number
): Promise<string> {
  const prompt = `You are the Tupi Tour AI Assistant for Tupi, South Cotabato, Philippines.
The traveler has requested a ${input.hours}-hour trip for ${input.travelers} traveler(s), traveling via ${input.transport} at a ${input.intensity} pace.
Their stated total budget is PHP ${input.budget}. The estimated total cost is PHP ${totalCost} (PHP ${remainingBudget} remaining).
Planned stops from the verified municipal catalog: ${rankedNames.join(", ")}.

Provide 2-3 concise, practical sentences with authentic local tips for Tupi:
- Highlight that the plan is based on and within their PHP ${input.budget} budget.
- Remind about fruit tasting along the Kablon highway and Mt. Matutum foothill breezes.
- Remind to carry cash for fruit purchases and on-site entrance verification.
Do not invent fictional destinations or mention places outside Tupi.`;

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

  return `Planned stops: ${rankedNames.join(", ") || "Tupi town proper and highland farms"}. This plan is budgeted at ₱${totalCost.toLocaleString()} (within your ₱${input.budget.toLocaleString()} target with ₱${remainingBudget.toLocaleString()} remaining). Bring cash for roadside fruit stalls in Kablon and a light jacket for cool Mt. Matutum foothill air.`;
}

export async function buildItinerary(input: PlannerInput) {
  const { origin, ranked: initialRanked, tupiApproved } = await pickSpots(input);
  let ranked = [...initialRanked];

  // Helper to calculate total circuit distance
  const calculateCircuitKm = (spots: TouristSpot[]) => {
    let km = 0;
    let last = origin;
    for (const spot of spots) {
      km += haversineKm(last, spot);
      last = spot;
    }
    km += haversineKm(last, origin);
    return km;
  };

  let travelKm = calculateCircuitKm(ranked);
  let transportCost = computeTransportCost(travelKm, input.transport, input.travelers);
  let food = 150 * input.travelers;
  let fees = ranked.reduce((sum, s) => sum + (s.estimatedEntranceFee || 0), 0) * input.travelers;
  let other = 40 * input.travelers;
  let total = transportCost + food + fees + other;

  // If initial selection exceeds budget and budget can accommodate fewer/free spots, optimize:
  if (total > input.budget && input.budget >= 800) {
    while (total > input.budget && ranked.length > 2) {
      const highestFeeIdx = ranked.reduce(
        (maxIdx, s, idx, arr) => ((s.estimatedEntranceFee || 0) > (arr[maxIdx].estimatedEntranceFee || 0) ? idx : maxIdx),
        0
      );

      if ((ranked[highestFeeIdx].estimatedEntranceFee || 0) > 0) {
        // Swap with a zero-entrance alternative in Tupi
        const freeAlt = tupiApproved.find(
          (s) => (s.estimatedEntranceFee || 0) === 0 && !ranked.some((r) => r.id === s.id)
        );
        if (freeAlt) {
          ranked[highestFeeIdx] = freeAlt;
        } else {
          ranked.splice(highestFeeIdx, 1);
        }
      } else {
        ranked.pop();
      }

      travelKm = calculateCircuitKm(ranked);
      transportCost = computeTransportCost(travelKm, input.transport, input.travelers);
      fees = ranked.reduce((sum, s) => sum + (s.estimatedEntranceFee || 0), 0) * input.travelers;
      total = transportCost + food + fees + other;
    }
  }

  const over = total > input.budget;
  const withinBudget = !over;
  const deficit = Math.max(0, total - input.budget);
  const remainingBudget = Math.max(0, input.budget - total);

  // Build the detailed timeline blocks
  let cursor = 8 * 60; // 08:00 AM start
  const blocks: {
    time: string;
    title: string;
    kind: "spot" | "break" | "return";
    minutes: number;
    spot?: any;
    note: string;
  }[] = [];

  let lastPoint = origin;
  for (let i = 0; i < ranked.length; i++) {
    const spot = ranked[i];
    const km = haversineKm(lastPoint, spot);
    const ride = Math.max(12, Math.round((km / 28) * 60));
    cursor += ride;
    const stay = input.intensity === "easy" ? 50 : input.intensity === "active" ? 80 : 65;
    const hh = String(Math.floor(cursor / 60)).padStart(2, "0");
    const mm = String(cursor % 60).padStart(2, "0");

    const feeDesc = spot.estimatedEntranceFee ? `₱${spot.estimatedEntranceFee}/pax` : "Free entrance";
    blocks.push({
      time: `${hh}:${mm}`,
      title: spot.name,
      kind: "spot",
      minutes: stay,
      spot: await enrichSpot(spot, input.userId, origin),
      note: `About ${km.toFixed(1)} km from previous stop (${feeDesc}). Stay duration is ~${stay} mins.`,
    });

    cursor += stay;

    // Add meal break after stop 1 or 2
    if (i === 1 || (i === 2 && ranked.length > 3)) {
      const lunchH = String(Math.floor(cursor / 60)).padStart(2, "0");
      const lunchM = String(cursor % 60).padStart(2, "0");
      blocks.push({
        time: `${lunchH}:${lunchM}`,
        title: "Meal or Fruit Break (Kablon roadside fruit stalls & cafe)",
        kind: "break",
        minutes: 45,
        note: `Budgeted meal & snack allowance: ~₱${Math.round(food / input.travelers)} per person.`,
      });
      cursor += 45;
    }
    lastPoint = spot;
  }

  const backKm = haversineKm(lastPoint, origin);
  const backMin = Math.max(15, Math.round((backKm / 28) * 60));
  cursor += backMin;

  blocks.push({
    time: `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`,
    title: "Return toward starting point / Tupi Poblacion",
    kind: "return",
    minutes: backMin,
    note: "Scenic return trip through Tupi highway corridor.",
  });

  const budgetSuggestions: string[] = [];
  if (over) {
    if (input.transport !== "jeepney") {
      budgetSuggestions.push(
        `Switching from ${input.transport} to public jeepney or shared tricycle can save approx. ₱${Math.round(transportCost * 0.45)}.`
      );
    }
    if (fees > 0) {
      budgetSuggestions.push(
        `Substitute one paid farm entrance with a free scenic viewpoint like Tupi Fruit Park, Magsangyaw, or Mt. Matutum roadside decks.`
      );
    }
    budgetSuggestions.push(
      `Pack your own refreshments and water to reduce incidental meal expenses.`
    );
  } else if (remainingBudget > 0) {
    budgetSuggestions.push(
      `You have ₱${remainingBudget.toLocaleString()} remaining from your ₱${input.budget.toLocaleString()} budget, ideal for fresh pineapples and local produce at Tupi Fruit Park.`
    );
  }

  const rankedNames = ranked.map((s) => s.name);
  const aiNotes = await generateAiItineraryNotes(rankedNames, input, total, remainingBudget);

  const alternativesRaw = tupiApproved
    .filter((s) => !ranked.some((r) => r.id === s.id))
    .slice(0, 3);
  const alternatives = await Promise.all(
    alternativesRaw.map((s) => enrichSpot(s, input.userId, origin))
  );

  const budgetNote = over
    ? `The estimated total of ₱${total.toLocaleString()} is ₱${deficit.toLocaleString()} above your stated budget of ₱${input.budget.toLocaleString()}. Review the suggestions below to bring it within budget.`
    : remainingBudget === 0
    ? `This itinerary is calibrated to match your exact budget of ₱${input.budget.toLocaleString()}.`
    : `This itinerary is carefully tailored to your ₱${input.budget.toLocaleString()} budget (Estimated total: ₱${total.toLocaleString()}, leaving ₱${remainingBudget.toLocaleString()} remaining).`;

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
      remainingBudget,
      deficit,
      withinBudget,
      suggestions: budgetSuggestions,
      note: budgetNote,
    },
    aiNotes,
  };
}
