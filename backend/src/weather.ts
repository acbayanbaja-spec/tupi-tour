interface WeatherForecast {
  current: {
    tempC: number;
    feelsLikeC: number;
    humidity: number;
    condition: string;
    weatherCode: number;
    windKmh: number;
    isRainy: boolean;
  };
  daily: {
    date: string;
    tempMaxC: number;
    tempMinC: number;
    rainProb: number;
    condition: string;
  }[];
  advisory: string;
  lastUpdated: string;
  source: string;
}

let cachedForecast: { data: WeatherForecast; timestamp: number } | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function conditionFromCode(code: number): { text: string; rainy: boolean } {
  if (code === 0) return { text: "Clear Sky", rainy: false };
  if (code === 1 || code === 2) return { text: "Mainly Clear / Partly Cloudy", rainy: false };
  if (code === 3) return { text: "Overcast", rainy: false };
  if (code === 45 || code === 48) return { text: "Highland Fog / Mist", rainy: false };
  if (code >= 51 && code <= 57) return { text: "Light Drizzle", rainy: true };
  if (code >= 61 && code <= 67) return { text: "Rain", rainy: true };
  if (code >= 80 && code <= 82) return { text: "Rain Showers", rainy: true };
  if (code >= 95) return { text: "Thunderstorm", rainy: true };
  return { text: "Partly Cloudy", rainy: false };
}

function generateAdvisory(isRainy: boolean, tempMax: number, rainProb: number): string {
  if (isRainy || rainProb >= 60) {
    return "Wet conditions expected. Highland roads leading to Mt. Matutum foothill farms (such as Sitio Glandang) may be slippery. Bring an umbrella, light raincoat, and sturdy footwear.";
  }
  if (tempMax >= 32) {
    return "Warm day in Tupi. Great for visiting roadside fruit stalls and shaded farm walks; carry water and wear sun protection.";
  }
  return "Pleasant travel weather across Tupi. Excellent visibility for Mount Matutum views and flower farm visits.";
}

export async function getTupiWeather(): Promise<WeatherForecast | null> {
  const now = Date.now();
  if (cachedForecast && now - cachedForecast.timestamp < CACHE_TTL_MS) {
    return cachedForecast.data;
  }

  // Tupi Coordinates: lat 6.3347, lng 124.9669
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=6.3347&longitude=124.9669&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FManila&forecast_days=3";

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Weather service returned HTTP ${res.status}`);

    const raw = await res.json();
    const curr = raw.current;
    const cond = conditionFromCode(curr.weather_code);

    const dailyList: WeatherForecast["daily"] = [];
    if (raw.daily?.time) {
      for (let i = 0; i < raw.daily.time.length; i++) {
        const dCode = raw.daily.weather_code?.[i] ?? 0;
        dailyList.push({
          date: raw.daily.time[i],
          tempMaxC: Math.round(raw.daily.temperature_2m_max?.[i] ?? 30),
          tempMinC: Math.round(raw.daily.temperature_2m_min?.[i] ?? 22),
          rainProb: raw.daily.precipitation_probability_max?.[i] ?? 0,
          condition: conditionFromCode(dCode).text,
        });
      }
    }

    const rainProb = dailyList[0]?.rainProb || 0;
    const tempMax = dailyList[0]?.tempMaxC || 30;

    const forecast: WeatherForecast = {
      current: {
        tempC: Math.round(curr.temperature_2m),
        feelsLikeC: Math.round(curr.apparent_temperature),
        humidity: curr.relative_humidity_2m,
        condition: cond.text,
        weatherCode: curr.weather_code,
        windKmh: Math.round(curr.wind_speed_10m),
        isRainy: cond.rainy,
      },
      daily: dailyList,
      advisory: generateAdvisory(cond.rainy, tempMax, rainProb),
      lastUpdated: new Date().toISOString(),
      source: "Open-Meteo Weather Forecast (Asia/Manila)",
    };

    cachedForecast = { data: forecast, timestamp: now };
    return forecast;
  } catch (err) {
    console.warn("Weather fetch failed (using cached if available or null):", (err as Error).message);
    if (cachedForecast) {
      return cachedForecast.data;
    }
    return null;
  }
}
