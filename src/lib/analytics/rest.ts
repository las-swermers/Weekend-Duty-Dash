import type { OrahLocationRecord } from "@/types/orah";
import { median } from "./watchlist";

export interface RestVisit {
  studentId: number;
  location: string;
  locationId: number;
  kind: "health" | "room";
  start: string | null;
  end: string | null;
  quality: "paired" | "location-change" | "ongoing" | "incomplete";
  minutes: number | null;
}
export function restKind(
  location: { id: number; name?: string },
  healthIds: number[],
  roomIds: number[],
  pattern: string,
): RestVisit["kind"] | null {
  if (healthIds.includes(location.id)) return "health";
  if (
    roomIds.includes(location.id) ||
    (pattern && location.name?.toLowerCase().includes(pattern.toLowerCase()))
  )
    return "room";
  return null;
}

// Location changes are evidence of departure, but not an exact pass end.
// Only explicitly paired, same-location in/out events enter duration KPIs.
export function restVisits(
  records: OrahLocationRecord[],
  start: string,
  end: string,
  healthIds: number[],
  roomIds: number[],
  pattern: string,
  current: OrahLocationRecord[] = [],
): RestVisit[] {
  const lo = Date.parse(start),
    hi = Date.parse(end);
  const visits: RestVisit[] = [];
  const open = new Map<number, OrahLocationRecord>();
  const kind = (r: OrahLocationRecord) =>
    restKind(r.location, healthIds, roomIds, pattern);
  function add(
    r: OrahLocationRecord,
    close: string | null,
    quality: RestVisit["quality"],
    missingStart = false,
  ) {
    const begin = missingStart ? null : r.record_time;
    if (close && Date.parse(close) < lo) return;
    if (begin && Date.parse(begin) > hi) return;
    const minutes =
      begin && close && quality === "paired"
        ? Math.max(
            0,
            (Math.min(hi, Date.parse(close)) -
              Math.max(lo, Date.parse(begin))) /
              60_000,
          )
        : null;
    visits.push({
      studentId: r.student.id,
      location: r.location.name,
      locationId: r.location.id,
      kind: kind(r)!,
      start: begin,
      end: close,
      quality,
      minutes,
    });
  }
  const events = [...new Map(records.map((r) => [r.id, r])).values()]
    .filter(
      (r) =>
        Number.isFinite(Date.parse(r.record_time)) &&
        Date.parse(r.record_time) <= hi,
    )
    .sort((a, b) => a.record_time.localeCompare(b.record_time) || a.id - b.id);
  for (const r of events) {
    const prior = open.get(r.student.id);
    if (r.type === "transit") {
      if (prior) {
        add(prior, r.record_time, "location-change");
        open.delete(r.student.id);
      }
    } else if (r.type === "in") {
      if (prior && prior.location.id === r.location.id) continue; // duplicate/reaffirmed check-in
      if (prior) {
        add(prior, r.record_time, "location-change");
        open.delete(r.student.id);
      }
      if (kind(r)) open.set(r.student.id, r);
    } else if (r.type === "out" && kind(r)) {
      if (prior?.location.id === r.location.id) {
        add(prior, r.record_time, "paired");
        open.delete(r.student.id);
      } else if (Date.parse(r.record_time) >= lo)
        add(r, r.record_time, "incomplete", true);
    }
  }
  const currentMap = new Map(
    current.filter((r) => r.type === "in").map((r) => [r.student.id, r]),
  );
  for (const r of open.values()) {
    const active = currentMap.get(r.student.id);
    add(
      r,
      null,
      active?.location.id === r.location.id &&
        Date.parse(active.record_time) <= hi
        ? "ongoing"
        : "incomplete",
    );
  }
  // Catch students whose stay began before the look-back window.
  for (const r of currentMap.values()) {
    if (
      kind(r) &&
      Date.parse(r.record_time) <= hi &&
      !open.has(r.student.id) &&
      !visits.some((v) => v.studentId === r.student.id && !v.end)
    )
      add(r, null, "ongoing");
  }
  return visits.sort((a, b) =>
    (b.start ?? b.end ?? "").localeCompare(a.start ?? a.end ?? ""),
  );
}

export function restSummary(visits: RestVisit[]) {
  const paired = visits.filter(
    (v) => v.quality === "paired" && v.minutes !== null,
  );
  return {
    visits: visits.length,
    students: new Set(visits.map((v) => v.studentId)).size,
    paired: paired.length,
    medianMinutes: median(
      paired.map((v) => (Date.parse(v.end!) - Date.parse(v.start!)) / 60_000),
    ),
    totalHours: paired.reduce((n, v) => n + v.minutes!, 0) / 60,
    inferred: visits.filter((v) => v.quality === "location-change").length,
    ongoing: visits.filter((v) => v.quality === "ongoing").length,
    incomplete: visits.filter((v) => v.quality === "incomplete").length,
  };
}
