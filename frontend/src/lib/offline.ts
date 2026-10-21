import type { Spot } from "./api";

const CACHE_SPOTS_KEY = "tupi_offline_spots";
const CACHE_SYNC_TIME_KEY = "tupi_offline_sync_time";
const QUEUED_ACTIONS_KEY = "tupi_offline_queue";

export function saveSpotsOffline(spots: Spot[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_SPOTS_KEY, JSON.stringify(spots));
    localStorage.setItem(CACHE_SYNC_TIME_KEY, new Date().toISOString());
  } catch (err) {
    console.warn("Could not save spots to offline cache:", err);
  }
}

export function getOfflineSpots(): Spot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHE_SPOTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getOfflineSyncTime(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CACHE_SYNC_TIME_KEY);
}

export function queueOfflineAction(action: { type: string; payload: Record<string, unknown> }): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(QUEUED_ACTIONS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push({ ...action, queuedAt: new Date().toISOString() });
    localStorage.setItem(QUEUED_ACTIONS_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("Could not queue offline action:", err);
  }
}

export function getQueuedActions(): { type: string; payload: Record<string, unknown>; queuedAt: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUED_ACTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearQueuedActions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(QUEUED_ACTIONS_KEY);
}
