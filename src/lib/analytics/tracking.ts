import { randomUUID } from "node:crypto";
import { kv } from "@vercel/kv";
import { isMockMode, orahCall } from "@/lib/orah";
import { WEEKEND_INFRACTION_CATEGORIES } from "@/lib/dates";
import { storageReady } from "@/lib/reports/store";
import type { OrahPastoralRecord } from "@/types/orah";
import { observeWatchlist, type WatchState } from "./watchlist";

const STATE = "analytics:v1:watchlist";
const SETTINGS = "analytics:v1:targets";
const LOCK = "analytics:v1:sync-lock";
export const defaultCategories = [
  "1-hour early check-in",
  "2-hour early check-in",
  ...WEEKEND_INFRACTION_CATEGORIES,
];
export interface TrackingSettings {
  targets: Record<string, number>;
  updatedAt?: string;
  updatedBy?: string;
}
export async function getTracking(): Promise<WatchState | null> {
  if (!storageReady()) throw new Error("Watchlist storage is not configured.");
  return kv.get<WatchState>(STATE);
}
export async function getTargets(): Promise<TrackingSettings> {
  if (!storageReady()) return { targets: {} };
  return (await kv.get<TrackingSettings>(SETTINGS)) ?? { targets: {} };
}
export function validateTargets(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Targets must be a category/hour mapping.");
  const entries = Object.entries(value);
  if (entries.length > 50) throw new Error("Maximum 50 categories.");
  const clean: Record<string, number> = {};
  for (const [category, hours] of entries) {
    if (
      !category.trim() ||
      category.length > 120 ||
      ["__proto__", "constructor", "prototype"].includes(category) ||
      typeof hours !== "number" ||
      !Number.isFinite(hours) ||
      hours < 1 ||
      hours > 8760
    )
      throw new Error(
        "Use a category name and a target from 1 to 8760 elapsed hours.",
      );
    if (
      Object.keys(clean).some(
        (c) => c.toLowerCase() === category.trim().toLowerCase(),
      )
    )
      throw new Error("Duplicate category.");
    clean[category.trim()] = hours;
  }
  return clean;
}
export async function saveTargets(
  targets: Record<string, number>,
  updatedBy: string,
) {
  if (!storageReady()) throw new Error("Watchlist storage is not configured.");
  await kv.set(SETTINGS, {
    targets,
    updatedBy,
    updatedAt: new Date().toISOString(),
  });
}

// Full snapshots avoid relying on edits updating timestamps or expiry events
// appearing in an incremental feed. Abort, without advancing, on partial data.
export async function fetchWatchlistSnapshot(): Promise<OrahPastoralRecord[]> {
  const all: OrahPastoralRecord[] = [],
    seen = new Set<number>();
  const began = Date.now();
  for (let page = 0; page < 80; page++) {
    if (Date.now() - began > 200_000)
      throw new Error("Watchlist scan exceeded its time budget.");
    const response = await orahCall<{ data: OrahPastoralRecord[] }>(
      "/open-api/pastoral/timeline",
      {
        query: {
          date_range: { start_date: "1970-01-01T00:00:00Z" },
          page_size: 500,
          page_index: page,
        },
      },
    );
    if (!Array.isArray(response.data))
      throw new Error("Incomplete pastoral response.");
    for (const record of response.data) {
      if (
        !Number.isFinite(record.id) ||
        !record.student?.id ||
        typeof record.watchlist !== "boolean" ||
        seen.has(record.id)
      )
        throw new Error(
          "Invalid or repeated pastoral records; observation not saved.",
        );
      seen.add(record.id);
      all.push(record);
    }
    if (response.data.length < 500) return all;
  }
  throw new Error(
    "Pastoral history exceeded the scan limit; observation not saved.",
  );
}
export async function syncWatchlist(): Promise<WatchState> {
  if (!storageReady()) throw new Error("Watchlist storage is not configured.");
  if (
    isMockMode() ||
    (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")
  )
    throw new Error(
      "Watchlist collection is disabled for mock data and preview deployments.",
    );
  const token = randomUUID();
  if (!(await kv.set(LOCK, token, { nx: true, ex: 300 })))
    throw new Error("Watchlist collection is already running.");
  try {
    const previous = await getTracking();
    if (previous && Date.now() - Date.parse(previous.observedAt) < 60_000)
      return previous;
    const scanStartedAt = new Date().toISOString();
    const [records, settings] = await Promise.all([
      fetchWatchlistSnapshot(),
      getTargets(),
    ]);
    const state = observeWatchlist(
      previous,
      records,
      new Date().toISOString(),
      [...defaultCategories, ...Object.keys(settings.targets)],
      scanStartedAt,
    );
    // Last scan start is a conservative lower bound for the next transition.
    state.scanStartedAt = scanStartedAt;
    const saved = await kv.eval(
      "if redis.call('get',KEYS[1]) == ARGV[1] then redis.call('set',KEYS[2],ARGV[2]); return 1 else return 0 end",
      [LOCK, STATE],
      [token, JSON.stringify(state)],
    );
    if (!saved) throw new Error("Collection lock expired; retry the scan.");
    return state;
  } finally {
    await kv.eval(
      "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
      [LOCK],
      [token],
    );
  }
}
