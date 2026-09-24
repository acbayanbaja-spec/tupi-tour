export const API_URL = process.env.NEXT_PUBLIC_BROWSER_API_URL || "";

const TOKEN_KEY = "tupi_access";
const REFRESH_KEY = "tupi_refresh";

export function getTokens() {
  if (typeof window === "undefined") return { access: "", refresh: "" };
  return { access: localStorage.getItem(TOKEN_KEY) || "", refresh: localStorage.getItem(REFRESH_KEY) || "" };
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function refreshAccess() {
  const { refresh } = getTokens();
  if (!refresh) return false;
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) {
    clearTokens();
    return false;
  }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const { access } = getTokens();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (access) headers.set("Authorization", `Bearer ${access}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && retry) {
    const ok = await refreshAccess();
    if (ok) return api<T>(path, init, false);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

export type Spot = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  lat: number;
  lng: number;
  address: string;
  barangay: string;
  amenities: string[];
  images: { url: string; alt: string }[];
  featured: boolean;
  status: string;
  dataSource: string;
  estimatedEntranceFee?: number;
  operatingHours?: { days: string; hours: string; reliability: string };
  category?: { id: string; slug: string; name: string } | null;
  rating: { average: number; count: number };
  isFavorite?: boolean;
  distanceKm?: number | null;
  etaMinutes?: number | null;
  viewCount: number;
  visitCount: number;
};
