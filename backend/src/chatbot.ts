import { config } from "./config.js";
import { store } from "./store.js";

const SYSTEM = `You are Tupi Guide, a helpful travel assistant for Tupi, South Cotabato, Philippines only.
Do not recommend destinations outside Tupi unless the user is asking how to reach Tupi from nearby cities (Koronadal, Polomolok, General Santos).
Never invent exact entrance fees or guaranteed opening hours. If unsure, say it must be confirmed locally.
Be concise, warm, and practical. Use Philippine English.`;

function knowledge() {
  return store
    .spots("approved")
    .map((s) => `- ${s.name} (${s.barangay}): ${s.shortDescription}`)
    .join("\n");
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function localReply(message: string) {
  const q = message.toLowerCase();
  const spots = store.spots("approved");
  const match = spots.find((s) => q.includes(s.name.toLowerCase().split(" ")[0]) || q.includes(s.slug.replace(/-/g, " ")));
  if (q.includes("itinerary") || q.includes("plan") || q.includes("half day") || q.includes("one day")) {
    return {
      source: "local",
      reply:
        "A practical Tupi half-day: start at Tupi Poblacion, ride toward Barangay Kablon for Tupi Fruit Park, continue to SG Farm in Sitio Glandang if the weather is clear, then catch Mt. Matutum views on the way. If you prefer flowers, swap SG Farm for Mariano’s Blooming Park. Treat travel times as estimates and confirm farm hours before you go.",
    };
  }
  if (q.includes("fruit") || q.includes("pineapple")) {
    return {
      source: "local",
      reply:
        "For fruit, go to Tupi Fruit Park in Barangay Kablon along the national highway. Pineapple country views are visible from public roads — do not enter private plantations. SG Farm is better if you want a highland farm experience rather than a roadside market.",
    };
  }
  if (match) {
    return {
      source: "local",
      reply: `${match.name} is in ${match.barangay}. ${match.description.slice(0, 420)} Coordinates are estimated for navigation (${match.lat}, ${match.lng}).`,
    };
  }
  return {
    source: "local",
    reply:
      "I can help you explore Tupi: SG Farm, Tupi Fruit Park, Mariano’s Blooming Park, Magsangyaw Land of Praise, Matutum viewpoints, Taal Falls, and town proper. Ask for a half-day plan, nearby ideas, or a specific destination.",
  };
}

async function groq(messages: { role: string; content: string }[]) {
  const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama-3.1-8b-instant", messages, temperature: 0.4 }),
  });
  if (!res.ok) throw new Error("groq");
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content;
}

async function gemini(prompt: string) {
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) throw new Error("gemini");
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function pollinations(messages: { role: string; content: string }[]) {
  const res = await fetchWithTimeout("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      messages,
      referrer: config.pollinationsReferrer,
    }),
  });
  if (!res.ok) throw new Error("pollinations");
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("pollinations-empty");
  return text;
}

export async function chatTupi(history: { role: "user" | "assistant"; content: string }[], message: string) {
  const messages = [
    { role: "system", content: `${SYSTEM}\n\nKnown destinations:\n${knowledge()}` },
    ...history.slice(-8),
    { role: "user", content: message },
  ];
  const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  try {
    if (config.groqKey) {
      const reply = await groq(messages);
      if (reply) return { source: "groq", reply };
    }
  } catch {
    /* next */
  }
  try {
    if (config.geminiKey) {
      const reply = await gemini(prompt);
      if (reply) return { source: "gemini", reply };
    }
  } catch {
    /* next */
  }
  if (process.env.POLLINATIONS_ENABLED === "true") {
    try {
      const reply = await pollinations(messages);
      if (reply) return { source: "pollinations", reply };
    } catch {
      /* local */
    }
  }
  return localReply(message);
}
