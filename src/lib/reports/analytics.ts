import {
  weekKey,
  weekRange,
  warningsCategories,
  WEEKEND_INFRACTION_CATEGORIES,
} from "@/lib/dates";
import type {
  OrahLocationRecord,
  OrahPastoralRecord,
  OrahStudent,
} from "@/types/orah";
import { studentDisplayName } from "@/lib/orah-resources";
import type { DormAnalytics } from "./types";

export function aggregateDorm(
  pastoral: OrahPastoralRecord[],
  movements: OrahLocationRecord[],
  students: OrahStudent[],
  dormId: number,
  key: string,
  expanded: boolean,
  healthIds: number[],
  restIds: number[],
  restPattern: string,
): DormAnalytics {
  const anchor = new Date(`${key}T12:00:00Z`);
  const range = weekRange(anchor);
  const roster = new Map(
    students.filter((s) => s.house?.id === dormId).map((s) => [s.id, s]),
  );
  const core = new Set(
    [
      ...warningsCategories(),
      ...WEEKEND_INFRACTION_CATEGORIES,
      "1-hour early check-in",
      "2-hour early check-in",
      process.env.NO_PA_CATEGORY_NAME ?? "No Physical Activity",
    ].map((s) => s.toLowerCase()),
  );
  const trend = Array.from({ length: 8 }, (_, i) => ({
    label: weekKey(weekRange(anchor, i - 7).start),
    count: 0,
  }));
  const day = (iso: string) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  const daily = Array.from({ length: 7 }, (_, i) => {
    // Calendar labels; UTC midday cannot cross the Zurich date boundary.
    const d = new Date(`${key}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { label: day(d.toISOString()), count: 0 };
  });
  const cats = new Map<string, number>();
  const unique = new Set<number>();
  let total = 0;
  for (const r of new Map(pastoral.map((r) => [r.id, r])).values()) {
    const time = Date.parse(r.date);
    if (r.sensitive || !roster.has(r.student.id) || !Number.isFinite(time))
      continue;
    const cat = r.pastoral_category?.name?.trim() || "Uncategorised";
    if (!expanded && !core.has(cat.toLowerCase())) continue;
    const bucket = trend.find((b) => b.label === weekKey(new Date(time)));
    if (bucket) bucket.count++;
    if (time < +range.start || time > +range.end) continue;
    total++;
    unique.add(r.student.id);
    cats.set(cat, (cats.get(cat) ?? 0) + 1);
    const d = daily.find((b) => b.label === day(r.date));
    if (d) d.count++;
  }
  const locations = new Set([...healthIds, ...restIds]);
  const restEvents: DormAnalytics["restEvents"] = [];
  const resting = new Set<number>();
  let restCheckins = 0;
  for (const r of new Map(movements.map((r) => [r.id, r])).values()) {
    const time = Date.parse(r.record_time);
    if (
      !roster.has(r.student.id) ||
      !Number.isFinite(time) ||
      time < +range.start ||
      time > +range.end
    )
      continue;
    if (
      !locations.has(r.location.id) &&
      !(
        restPattern &&
        r.location.name?.toLowerCase().includes(restPattern.toLowerCase())
      )
    )
      continue;
    if (r.type === "in") {
      restCheckins++;
      resting.add(r.student.id);
    }
    restEvents.push({
      name: studentDisplayName(roster.get(r.student.id)).full,
      when: r.record_time,
      location: r.location.name,
      action: r.type === "in" ? "Check-in" : r.type === "out" ? "Check-out" : "In transit",
    });
  }
  restEvents.sort((a, b) => a.when.localeCompare(b.when));
  return {
    total,
    uniqueStudents: unique.size,
    categories: Array.from(cats, ([label, count]) => ({ label, count })).sort(
      (a, b) => b.count - a.count,
    ),
    daily,
    trend,
    restCheckins,
    restingStudents: resting.size,
    restEvents,
  };
}
