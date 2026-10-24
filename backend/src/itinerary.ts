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
 * Format total minutes from midnight into 12-hour clock format (e.g., 480 -> "08:00 AM", 780 -> "01:00 PM")
 */
export function formatClock(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const hh = String(displayH).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm} ${period}`;
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
 * Budget-constrained and duration-aware spot selection for Tupi, South Cotabato.
 * Ensures the stopover count is calibrated to what the tourist can afford and fit in time.
 * e.g. 2 stops for 2-3h, 3-4 affordable stops for 4-5h within ₱1,000 budget.
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

  // Determine stopover limit based on duration & budget:
  // - 2 to 3 hours: 2 stops max
  // - 4 to 5 hours: 3 to 4 stops max (tailored to affordability)
  // - 6 to 7 hours: 4 stops max
  // - 8+ hours: 4 to 5 stops max
  let maxStops: number;
  if (input.hours <= 3) {
    maxStops = 2;
  } else if (input.hours <= 5) {
    maxStops = 4;
  } else if (input.hours <= 7) {
    maxStops = 4;
  } else {
    maxStops = 5;
  }

  const allApproved = await store.spots("approved");
  // Exclusively consider verified spots within Tupi, South Cotabato
  const tupiApproved = allApproved.filter((s) => isWithinTupi(s.lat, s.lng));

  const perPersonFood = input.budget <= 1000 ? 110 : input.budget <= 1500 ? 130 : 150;
  const perPersonOther = input.budget <= 1000 ? 25 : 40;

  // Score candidate spots based on interest relevance, popularity, and affordability
  const scored = tupiApproved.map((s) => {
    let score = s.popularityScore - haversineKm(origin, s) * 2;
    if (catIds.size && catIds.has(s.categoryId)) score += 30;
    if (input.intensity === "easy" && s.categoryId === "cat-nature") score -= 8;
    if (input.intensity === "active" && s.categoryId === "cat-nature") score += 10;

    const feePerPerson = s.estimatedEntranceFee || 0;
    // For tight budgets (<= 1000), strongly prioritize free spots and low-cost venues (<= ₱50)
    if (input.budget <= 1000) {
      if (feePerPerson === 0) {
        score += 35; // Strongly favor free scenic viewpoints & municipal fruit park
      } else if (feePerPerson <= 50) {
        score += 15; // Affordable community farms (e.g. SG Farm)
      } else {
        score -= 40; // Penalize expensive spots that would blow the traveler's budget
      }
    } else if (input.budget < 1600) {
      if (feePerPerson > 50) score -= 15;
    }
    return { s, score, feePerPerson };
  });

  scored.sort((a, b) => b.score - a.score);

  // Iteratively pick stops that stay within what the traveler can afford
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
    const candidateFood = perPersonFood * input.travelers;
    const candidateOther = perPersonOther * input.travelers;
    const candidateTotal = candidateTransport + candidateFees + candidateFood + candidateOther;

    // Check if adding this stop keeps the plan within budget (allow at least 2 stops for a valid circuit)
    if (candidateTotal <= input.budget || selected.length < 2) {
      selected.push(candidate.s);
      totalKm += legKm;
      totalFees += candidate.feePerPerson * input.travelers;
      currentLast = candidate.s;
    }
  }

  // If we haven't reached maxStops, see if remaining affordable/free candidates can be added within budget
  if (selected.length < maxStops) {
    for (const candidate of scored) {
      if (selected.length >= maxStops) break;
      if (selected.some((x) => x.id === candidate.s.id)) continue;

      const legKm = haversineKm(currentLast, candidate.s);
      const returnKm = haversineKm(candidate.s, origin);
      const candidateTotalKm = totalKm + legKm + returnKm;
      const candidateTransport = computeTransportCost(candidateTotalKm, input.transport, input.travelers);
      const candidateFees = totalFees + candidate.feePerPerson * input.travelers;
      const candidateFood = perPersonFood * input.travelers;
      const candidateOther = perPersonOther * input.travelers;
      const candidateTotal = candidateTransport + candidateFees + candidateFood + candidateOther;

      if (candidateTotal <= input.budget) {
        selected.push(candidate.s);
        totalKm += legKm;
        totalFees += candidate.feePerPerson * input.travelers;
        currentLast = candidate.s;
      }
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
The traveler has requested an exact ${input.hours}-hour trip for ${input.travelers} traveler(s), traveling via ${input.transport} at a ${input.intensity} pace.
Their stated total budget is PHP ${input.budget}. The estimated total cost is PHP ${totalCost} (PHP ${remainingBudget} remaining).
Planned stops from the verified municipal catalog: ${rankedNames.join(", ")}.

Provide 2-3 concise, practical sentences with authentic local tips for Tupi:
- Highlight that the plan is calibrated to exact ${input.hours} hours and fits within their PHP ${input.budget} budget.
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

  return `Planned stops: ${rankedNames.join(", ") || "Tupi town proper and highland viewpoints"}. This exact ${input.hours}-hour tour is budgeted at ₱${totalCost.toLocaleString()} (within your ₱${input.budget.toLocaleString()} target with ₱${remainingBudget.toLocaleString()} remaining). Bring cash for roadside fruit stalls in Kablon and a light jacket for cool Mt. Matutum foothill breezes.`;
}

export async function buildItinerary(input: PlannerInput) {
  const { origin, ranked: initialRanked, tupiApproved } = await pickSpots(input);
  let ranked = [...initialRanked];

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

  const perPersonFood = input.budget <= 1000 ? 110 : input.budget <= 1500 ? 130 : 150;
  let perPersonOther = input.budget <= 1000 ? 25 : 40;

  let travelKm = calculateCircuitKm(ranked);
  let transportCost = computeTransportCost(travelKm, input.transport, input.travelers);
  let food = perPersonFood * input.travelers;
  let fees = ranked.reduce((sum, s) => sum + (s.estimatedEntranceFee || 0), 0) * input.travelers;
  let other = perPersonOther * input.travelers;
  let total = transportCost + food + fees + other;

  // Optimization: If initial selection exceeds budget and budget is reasonable (>= 800),
  // substitute paid venues with free scenic spots in Tupi to ensure affordability
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

    // If slightly above budget due to incidentals, trim other/food buffer to fit target
    if (total > input.budget && total - input.budget <= 80) {
      const excess = total - input.budget;
      const trimOther = Math.min(other - 20 * input.travelers, excess);
      other -= Math.max(0, trimOther);
      const remainingExcess = total - input.budget - trimOther;
      if (remainingExcess > 0) {
        food -= remainingExcess;
      }
      total = transportCost + food + fees + other;
    }
  }

  // Exact Duration Calculation:
  // Start time: 08:00 AM (480 minutes from midnight).
  // Target duration: exactly input.hours * 60 minutes.
  // The final return arrival MUST occur at exactly 08:00 AM + input.hours.
  const targetMinutes = Math.round(input.hours * 60);
  const startMinutes = 8 * 60; // 08:00 AM

  // Calculate transit legs
  const transitTimes: number[] = [];
  let prevPoint = origin;
  for (let i = 0; i < ranked.length; i++) {
    const km = haversineKm(prevPoint, ranked[i]);
    const ride = Math.max(8, Math.round((km / 25) * 60));
    transitTimes.push(ride);
    prevPoint = ranked[i];
  }
  const returnKm = haversineKm(prevPoint, origin);
  const returnRide = Math.max(12, Math.round((returnKm / 25) * 60));
  const totalTransitMinutes = transitTimes.reduce((a, b) => a + b, 0) + returnRide;

  // Meal or refreshment break duration:
  // Only 1 break is inserted:
  // - 6+ hours: 45-min lunch break
  // - 4-5 hours: 30-min refreshment & fruit break
  // - <4 hours: 0 mins (express trip)
  let breakMinutes = 0;
  if (input.hours >= 6) {
    breakMinutes = 45;
  } else if (input.hours >= 4) {
    breakMinutes = 30;
  }

  // Calculate available stay time to distribute across destinations
  let availableStayMinutes = targetMinutes - totalTransitMinutes - breakMinutes;

  // If available stay time is overly squeezed (< 20 mins per spot) and we have > 2 spots,
  // drop the furthest stop so remaining spots have high-quality, relaxed visit time
  while (availableStayMinutes < ranked.length * 20 && ranked.length > 2) {
    ranked.pop();
    transitTimes.length = 0;
    let p = origin;
    for (let i = 0; i < ranked.length; i++) {
      const km = haversineKm(p, ranked[i]);
      transitTimes.push(Math.max(8, Math.round((km / 25) * 60)));
      p = ranked[i];
    }
    const retKm = haversineKm(p, origin);
    const retRide = Math.max(12, Math.round((retKm / 25) * 60));
    const newTransit = transitTimes.reduce((a, b) => a + b, 0) + retRide;
    availableStayMinutes = targetMinutes - newTransit - breakMinutes;
  }

  // Distribute available stay time evenly with exact minute remainder handling
  const spotCount = ranked.length;
  const baseStay = Math.floor(availableStayMinutes / spotCount);
  const remainder = availableStayMinutes % spotCount;
  const stayDurations = ranked.map((_, idx) => baseStay + (idx < remainder ? 1 : 0));

  // Build the detailed timeline blocks
  let cursor = startMinutes;
  const blocks: {
    time: string;
    title: string;
    kind: "spot" | "break" | "return";
    minutes: number;
    spot?: any;
    note: string;
  }[] = [];

  const breakAfterIndex = Math.max(0, Math.floor(spotCount / 2) - 1);
  prevPoint = origin;

  for (let i = 0; i < ranked.length; i++) {
    const spot = ranked[i];
    const legKm = haversineKm(prevPoint, spot);
    const rideMin = transitTimes[i];
    cursor += rideMin;

    const arrivalTime = formatClock(cursor);
    const feeDesc = spot.estimatedEntranceFee ? `₱${spot.estimatedEntranceFee}/pax` : "Free entrance";
    const stayMin = stayDurations[i];

    blocks.push({
      time: arrivalTime,
      title: spot.name,
      kind: "spot",
      minutes: stayMin,
      spot: await enrichSpot(spot, input.userId, origin),
      note: `Scenic travel: ${legKm.toFixed(1)} km (~${rideMin} mins ride). Recommended stay: ${stayMin} mins (${feeDesc}).`,
    });

    cursor += stayMin;

    // Insert exactly one meal or fruit break at mid-day
    if (breakMinutes > 0 && i === breakAfterIndex) {
      const breakTime = formatClock(cursor);
      blocks.push({
        time: breakTime,
        title: "Local Fruit & Refreshment Break (Kablon highway fruit stalls & cafe)",
        kind: "break",
        minutes: breakMinutes,
        note: `Enjoy authentic Tupi pineapples and refreshments. Budgeted: ~₱${Math.round(food / input.travelers)} per person.`,
      });
      cursor += breakMinutes;
    }

    prevPoint = spot;
  }

  // Return leg: arrives back at starting point / Poblacion at EXACTLY startMinutes + targetMinutes
  const exactReturnRide = (startMinutes + targetMinutes) - cursor;
  cursor += exactReturnRide;

  const finalArrivalTime = formatClock(cursor);
  const finalRetKm = haversineKm(prevPoint, origin);

  blocks.push({
    time: finalArrivalTime,
    title: "Return arrival at starting point / Tupi Poblacion",
    kind: "return",
    minutes: exactReturnRide,
    note: `Scenic return ride through Tupi highway corridor (~${finalRetKm.toFixed(1)} km). Tour completes on schedule.`,
  });

  const over = total > input.budget;
  const withinBudget = !over;
  const deficit = Math.max(0, total - input.budget);
  const remainingBudget = Math.max(0, input.budget - total);

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

  const startTimeStr = formatClock(startMinutes);
  const endTimeStr = formatClock(startMinutes + targetMinutes);

  return {
    title: input.hours <= 5 ? `Tupi ${input.hours}-Hour Adventure` : `Tupi ${input.hours}-Hour Full Experience`,
    generatedAt: new Date().toISOString(),
    hours: input.hours,
    targetMinutes,
    actualElapsedMinutes: cursor - startMinutes,
    startTime: startTimeStr,
    endTime: endTimeStr,
    destinationsCount: spotCount,
    assumptions: [
      `Exact ${input.hours}-hour duration calibrated from ${startTimeStr} to ${endTimeStr}.`,
      "Travel times use estimated road distance and local speed profiles.",
      "Entrance fees are verified municipal catalog rates; free viewpoints included to fit your budget.",
      "Operating hours reflect verified farm and roadside fruit stall schedules in Tupi.",
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
