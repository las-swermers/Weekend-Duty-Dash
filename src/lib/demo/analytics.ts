import type { AnalyticsData, StudentLabel } from "@/lib/analytics/types";
import type { Episode } from "@/lib/analytics/watchlist";
import type { RestVisit } from "@/lib/analytics/rest";
import { watchMetrics } from "@/lib/analytics/watchlist";
import { restSummary } from "@/lib/analytics/rest";
import { analyticsRange, localDay } from "@/lib/analytics/range";
import { weekKey, weekRange } from "@/lib/dates";

// Entirely invented fixtures. Never import Orah, Sheets, Redis or report senders here.
// A fixed clock keeps bookmarked demonstrations reproducible in future years.
export const DEMO_NOW = "2026-10-30T14:00:00.000Z";
export const DEMO_START = "2026-08-31";
export const demoHouses = [
  { id: 9001, name: "Cedar House" },
  { id: 9002, name: "Maple House" },
  { id: 9003, name: "Juniper House" },
  { id: 9004, name: "Willow House" },
];
const firstNames = [
  "Alex",
  "Robin",
  "Sam",
  "Avery",
  "Jordan",
  "Taylor",
  "Casey",
  "Morgan",
  "Riley",
  "Jamie",
  "Quinn",
  "Blair",
];
const surnames = [
  "North",
  "Vale",
  "Brook",
  "Field",
  "Reed",
  "Lane",
  "Lake",
  "Hill",
];
const roster: StudentLabel[] = Array.from({ length: 96 }, (_, i) => ({
  studentId: 90001 + i,
  name: `${firstNames[i % 12]} ${surnames[Math.floor(i / 12)]}`,
  dorm: demoHouses[Math.floor(i / 24)].name,
  dormId: demoHouses[Math.floor(i / 24)].id,
  year: String(9 + (i % 4)),
}));
const categories = [
  "Warning",
  "1-hour early check-in",
  "Saturday Clipboard",
  "Positive contribution",
  "Pastoral check-in",
];
const descriptions = [
  "Example: returned after the agreed check-in time.",
  "Example: early check-in assigned following a missed routine.",
  "Example: supervised service scheduled for the weekend.",
  "Example: supported another student during a house activity.",
  "Example: routine check-in about settling into the week.",
];
const targets = { "1-hour early check-in": 48, "Saturday Clipboard": 120 };
const iso = (ms: number) => new Date(ms).toISOString();
const hour = 3600_000;
const now = Date.parse(DEMO_NOW);
const records: NonNullable<AnalyticsData["pastoral"]>["records"] = [];
const episodes: (Episode & StudentLabel)[] = [];
const visits: (RestVisit & StudentLabel)[] = [];
for (let day = 0; day < 61; day++) {
  const at = Date.parse(`${DEMO_START}T08:00:00Z`) + day * 24 * hour;
  // Gradual variation with an autumn peak; no random or real student data.
  const count = 5 + (day % 4) + (day >= 28 && day < 42 ? 4 : 0);
  for (let j = 0; j < count; j++) {
    const cat = (day + j) % categories.length;
    // Repeat warnings for a small group so the conversation workflow is visible.
    const student =
      roster[
        cat === 0
          ? (day % 6) + (Math.floor(day / 6) % 4) * 24
          : (day * 7 + j * 11) % roster.length
      ];
    const date = iso(at + j * 20 * 60_000);
    const id = 800000 + day * 20 + j;
    records.push({
      ...student,
      id,
      date,
      category: categories[cat],
      description: descriptions[cat],
    });
    if (cat === 1 || cat === 2) {
      const start = Date.parse(date) + hour;
      const finish = start + (12 + ((day * 11 + j * 17) % 160)) * hour;
      const completed = finish < now && (day + j) % 9 !== 0;
      episodes.push({
        ...student,
        id: `demo-${id}`,
        recordId: id,
        category: categories[cat],
        incidentAt: date,
        startAfter: (day + j) % 31 === 0 ? null : iso(start - hour),
        startBy: iso(start),
        activeThrough: iso(completed ? finish - hour : now),
        ...(completed
          ? {
              endAfter: iso(finish - hour),
              endBy: iso(finish),
              outcome:
                (day + j) % 23 === 0
                  ? ("expiry-possible" as const)
                  : ("served" as const),
            }
          : {}),
      });
    }
  }
  for (let j = 0; j < 3; j++) {
    const student = roster[(day * 5 + j * 23) % roster.length];
    const start = at + j * hour;
    const end = start + (45 + ((day + j) % 5) * 30) * 60_000;
    const inferred = day % 9 === 0 && j === 1;
    visits.push({
      ...student,
      location: j === 2 ? "Room rest" : "Health Center",
      locationId: j === 2 ? 9902 : 9901,
      kind: j === 2 ? "room" : "health",
      start: iso(start),
      end: iso(end),
      quality: inferred ? "location-change" : "paired",
      minutes: inferred ? null : (end - start) / 60_000,
    });
  }
}
const current = [roster[2], roster[26], roster[51], roster[77]].map((s, i) => ({
  ...s,
  kind: i < 3 ? ("health" as const) : ("room" as const),
  since: iso(now - (i + 1) * hour),
}));
for (const s of current)
  visits.push({
    ...s,
    start: s.since,
    end: null,
    kind: s.kind,
    location: s.kind === "health" ? "Health Center" : "Room rest",
    locationId: s.kind === "health" ? 9901 : 9902,
    quality: "ongoing",
    minutes: null,
  });

export function buildDemoAnalytics(
  startDay: string,
  endDay: string,
  dorm: string,
): AnalyticsData {
  const range = analyticsRange(startDay, endDay, new Date(DEMO_NOW));
  if (startDay < DEMO_START)
    throw new Error(
      `Demo history starts on ${DEMO_START}. Choose a date in September or October 2026.`,
    );
  if (dorm && !demoHouses.some((h) => String(h.id) === dorm))
    throw new Error("Choose one of the fictional demo dorms.");
  const matches = (s: StudentLabel) => !dorm || String(s.dormId) === dorm;
  const students = roster.filter(matches);
  const scoped = records.filter(matches).filter((r) => r.date <= range.end);
  const selected = scoped.filter((r) => r.date >= range.start);
  const scopedEpisodes = episodes.filter(matches);
  const selectedVisits = visits
    .filter(matches)
    .filter((v) => v.start! <= range.end && (!v.end || v.end >= range.start))
    .map((v) => {
      const end = v.end && v.end <= range.end ? v.end : null;
      const quality = !end
        ? range.isLive && !v.end
          ? ("ongoing" as const)
          : ("incomplete" as const)
        : v.quality;
      return {
        ...v,
        end,
        quality,
        minutes:
          quality === "paired"
            ? (Math.min(Date.parse(range.end), Date.parse(end!)) -
                Math.max(Date.parse(range.start), Date.parse(v.start!))) /
              60_000
            : null,
      };
    });
  const week = weekKey(new Date(range.end));
  const warningStart = weekRange(new Date(range.end)).start.toISOString();
  const warningStudents = students.flatMap((s) => {
    const all = scoped.filter(
      (r) => r.studentId === s.studentId && r.category === "Warning",
    );
    if (!all.length) return [];
    const thisWeek = all.filter((r) => r.date >= warningStart);
    const done = s.studentId % 3 === 0 && thisWeek.length > 0;
    const conversationAt = done ? thisWeek.at(-1)!.date : null;
    const since = done ? 0 : all.length;
    return [
      {
        studentId: s.studentId,
        name: s.name,
        initials: s.name
          .split(" ")
          .map((n) => n[0])
          .join(""),
        dorm: s.dorm,
        dormId: s.dormId,
        yearLevel: s.year,
        warningsThisWeek: thisWeek.map((r) => ({
          id: r.id,
          date: r.date,
          description: r.description,
          action: "Example follow-up",
          note: "Fictional scenario",
          createdBy: "Demo staff",
        })),
        termWarningCount: all.length,
        warningsSinceLastConversation: since,
        lastConversationAt: conversationAt,
        conversationCount: done ? 1 : 0,
        computedLevel: Math.min(3, Math.floor(all.length / 3)),
        levelOverride: null,
        effectiveLevel: Math.min(3, Math.floor(all.length / 3)),
        dueNow: since >= 3,
        conversation: done
          ? {
              key: `${s.studentId}|${week}`,
              studentId: s.studentId,
              studentName: s.name,
              dorm: s.dorm,
              week,
              status: "done" as const,
              levelOverride: null,
              conversationDate: conversationAt,
              loggedBy: "Demo staff",
              response:
                "Example conversation: agreed a check-in routine and a follow-up next week.",
              updatedAt: conversationAt!,
            }
          : null,
      },
    ];
  });
  const days: { label: string; count: number }[] = [];
  for (
    let d = new Date(`${startDay}T12:00:00Z`);
    localDay(d) <= endDay;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const label = localDay(d);
    days.push({
      label,
      count: selected.filter((r) => localDay(new Date(r.date)) === label)
        .length,
    });
  }
  const currentStudents = current.filter(matches);
  return {
    start: range.start,
    end: range.end,
    pulledAt: DEMO_NOW,
    admin: false,
    houses: demoHouses,
    issues: [],
    rosterCount: students.length,
    pastoral: {
      total: selected.length,
      students: new Set(selected.map((r) => r.studentId)).size,
      records: selected.sort((a, b) => b.date.localeCompare(a.date)),
      categories: categories.map((label) => ({
        label,
        count: selected.filter((r) => r.category === label).length,
      })),
      days,
      weeks: Array.from({ length: 8 }, (_, i) => {
        const label = weekKey(weekRange(new Date(range.end), i - 7).start);
        return {
          label,
          count: scoped.filter((r) => weekKey(new Date(r.date)) === label)
            .length,
        };
      }),
      dorms: demoHouses
        .filter((h) => !dorm || String(h.id) === dorm)
        .map((h) => {
          const rows = selected.filter((r) => r.dormId === h.id);
          return {
            label: h.name,
            count: rows.length,
            students: new Set(rows.map((r) => r.studentId)).size,
            roster: 24,
            per100: Math.round((rows.length / 24) * 1000) / 10,
          };
        }),
    },
    watch: {
      startedAt: `${DEMO_START}T00:00:00Z`,
      observedAt: DEMO_NOW,
      targets,
      categories: Object.keys(targets),
      episodes: scopedEpisodes,
      metrics: watchMetrics(scopedEpisodes, range.start, range.end, targets),
    },
    rest: {
      visits: selectedVisits,
      summary: restSummary(selectedVisits),
      now: range.isLive
        ? {
            health: currentStudents.filter((s) => s.kind === "health").length,
            room: currentStudents.filter((s) => s.kind === "room").length,
            students: currentStudents,
          }
        : null,
    },
    warnings: { week, threshold: 3, students: warningStudents },
  };
}
