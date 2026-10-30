import type { OrahPastoralRecord } from "@/types/orah";

export interface Episode {
  id: string;
  recordId: number;
  studentId: number;
  category: string;
  incidentAt: string;
  startAfter: string | null;
  startBy: string;
  activeThrough?: string;
  endAfter?: string;
  endBy?: string;
  outcome?: "served" | "expiry-possible";
}
export interface WatchState {
  startedAt: string;
  observedAt: string;
  scanStartedAt?: string;
  records: Record<
    string,
    { active: boolean; expiry: string | null; seenAt?: string }
  >;
  episodes: Episode[];
}
export interface DurationBounds {
  minHours: number;
  maxHours: number;
}
export function durationBounds(e: Episode): DurationBounds | null {
  if (!e.startAfter || !e.endBy || !e.endAfter) return null;
  return {
    minHours: Math.max(
      0,
      (Date.parse(e.endAfter) - Date.parse(e.startBy)) / 3_600_000,
    ),
    maxHours: Math.max(
      0,
      (Date.parse(e.endBy) - Date.parse(e.startAfter)) / 3_600_000,
    ),
  };
}

// Only call after a complete scan. Missing records never imply removal.
// Mutation dates are deliberately not treated as watchlist transition dates.
export function observeWatchlist(
  previous: WatchState | null,
  records: OrahPastoralRecord[],
  now: string,
  categories: string[],
  scanStartedAt = now,
): WatchState {
  if (previous && Date.parse(now) <= Date.parse(previous.observedAt))
    throw new Error("Observation must follow the previous scan.");
  const state: WatchState = previous
    ? structuredClone(previous)
    : { startedAt: now, observedAt: now, records: {}, episodes: [] };
  const allowed = new Set(
    [...categories, ...state.episodes.map((e) => e.category)].map((c) =>
      c.toLowerCase(),
    ),
  );
  for (const r of records) {
    const cat = r.pastoral_category?.name?.trim() ?? "";
    if (r.sensitive || !allowed.has(cat.toLowerCase())) {
      delete state.records[r.id];
      state.episodes = state.episodes.filter((e) => e.recordId !== r.id);
      continue;
    }
    const old = state.records[r.id];
    const active = r.watchlist === true;
    if (active && !old?.active) {
      // A previously seen inactive record bounds its new start. A newly
      // created record can also be bounded by the last successful scan.
      const bounded =
        previous &&
        (old || Date.parse(r.created_at) >= Date.parse(previous.observedAt));
      state.episodes.push({
        id: `${r.id}:${now}`,
        recordId: r.id,
        studentId: r.student.id,
        category: cat,
        incidentAt: r.date,
        startAfter: bounded
          ? (old?.seenAt ?? previous!.scanStartedAt ?? previous!.observedAt)
          : null,
        startBy: now,
      });
    } else if (!active && old?.active) {
      const open = state.episodes.findLast(
        (e) => e.recordId === r.id && !e.endBy,
      );
      if (open) {
        open.endAfter = open.activeThrough ?? open.startBy;
        open.endBy = now;
        const expiry = Date.parse(old.expiry ?? r.watchlist_expiry ?? "");
        open.outcome =
          Number.isFinite(expiry) && expiry <= Date.parse(now)
            ? "expiry-possible"
            : "served";
      }
    }
    state.records[r.id] = {
      active,
      expiry: r.watchlist_expiry ?? null,
      seenAt: scanStartedAt,
    };
    if (active) {
      const episode = state.episodes.findLast(
        (e) => e.recordId === r.id && !e.endBy,
      );
      if (episode) episode.activeThrough = scanStartedAt;
    }
  }
  // Keep all open cases and one year of completed history.
  const cutoff = Date.parse(now) - 365 * 86400_000;
  state.episodes = state.episodes.filter(
    (e) => !e.endBy || Date.parse(e.endBy) >= cutoff,
  );
  state.observedAt = now;
  state.scanStartedAt = scanStartedAt;
  return state;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const a = [...values].sort((a, b) => a - b);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function waitingHours(e: Episode, cutoff: string): number {
  // A missing record or failed collector must never manufacture more waiting time.
  const through = Math.min(
    Date.parse(cutoff),
    Date.parse(e.activeThrough ?? e.startBy),
  );
  return Math.max(0, (through - Date.parse(e.startBy)) / 3_600_000);
}

export function watchMetrics(
  episodes: Episode[],
  start: string,
  end: string,
  targets: Record<string, number>,
) {
  const lo = Date.parse(start),
    hi = Date.parse(end);
  const open = episodes.filter(
    (e) =>
      Date.parse(e.startBy) <= hi && (!e.endBy || Date.parse(e.endBy) > hi),
  );
  const closed = episodes.filter(
    (e) => e.endBy && Date.parse(e.endBy) >= lo && Date.parse(e.endBy) <= hi,
  );
  const served = closed.filter((e) => e.outcome === "served");
  const measured = served
    .map(durationBounds)
    .filter((v): v is DurationBounds => v !== null);
  const average = (v: number[]) =>
    v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  const targetStatus = (e: Episode) => {
    const target = targets[e.category];
    const d = durationBounds(e);
    if (target == null || !d) return "unknown";
    if (d.maxHours <= target) return "within";
    if (d.minHours > target) return "late";
    return "uncertain";
  };
  const within = served.filter((e) => targetStatus(e) === "within").length;
  const late = served.filter((e) => targetStatus(e) === "late").length;
  const uncertain = served.filter(
    (e) => targetStatus(e) === "uncertain",
  ).length;
  return {
    open,
    closed,
    added: episodes.filter(
      (e) =>
        e.startAfter &&
        Date.parse(e.startBy) >= lo &&
        Date.parse(e.startBy) <= hi,
    ).length,
    served: served.length,
    expiryPossible: closed.length - served.length,
    measured: measured.length,
    unknownStart: served.length - measured.length,
    medianMinHours: median(measured.map((d) => d.minHours)),
    medianMaxHours: median(measured.map((d) => d.maxHours)),
    averageMinHours: average(measured.map((d) => d.minHours)),
    averageMaxHours: average(measured.map((d) => d.maxHours)),
    within,
    late,
    uncertain,
    targetUnknown: served.length - within - late - uncertain,
    withinPercent:
      within + late ? Math.round((100 * within) / (within + late)) : null,
    overdue: open.filter(
      (e) =>
        targets[e.category] != null &&
        waitingHours(e, end) > targets[e.category],
    ).length,
  };
}
