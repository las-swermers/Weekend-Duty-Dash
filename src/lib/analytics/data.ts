import { weekKey, weekRange } from "@/lib/dates";
import { orahCall, isMockMode } from "@/lib/orah";
import {
  listHouses,
  listStudents,
  listPastoralTimeline,
  listLocationRecordTimeline,
  resolveHealthCenterLocationIds,
  studentDisplayName,
} from "@/lib/orah-resources";
import { getWarningsForWeek } from "@/lib/warnings";
import type { OrahLocationRecord } from "@/types/orah";
import { defaultCategories, getTargets, getTracking } from "./tracking";
import { watchMetrics } from "./watchlist";
import { restVisits, restSummary, restKind } from "./rest";
import { localDay } from "./range";
import type { AnalyticsData, StudentLabel } from "./types";

export async function buildAnalytics(
  start: string,
  end: string,
  dormId: number | null,
  admin: boolean,
  warningsAccess: boolean,
  live: boolean,
): Promise<AnalyticsData> {
  if (isMockMode())
    throw new Error(
      "Analytics requires live sources; mock data is disabled here.",
    );
  const [houses, students] = await Promise.all([listHouses(), listStudents()]);
  if (!students.length || !houses.length)
    throw new Error("Student roster or dorms unavailable.");
  if (dormId !== null && !houses.some((h) => h.id === dormId))
    throw new Error("Unknown dorm.");
  const houseMap = new Map(houses.map((h) => [h.id, h.name]));
  const labels = new Map<number, StudentLabel>(
    students
      .filter(
        (s) => !s.deactivated && (dormId === null || s.house?.id === dormId),
      )
      .map((s) => [
        s.id,
        {
          studentId: s.id,
          name: studentDisplayName(s).full,
          dorm: houseMap.get(s.house?.id ?? 0) ?? "Unassigned",
          dormId: s.house?.id ?? null,
          year: s.year_level ?? "",
        },
      ]),
  );
  const data: AnalyticsData = {
    start,
    end,
    pulledAt: new Date().toISOString(),
    admin,
    houses: houses
      .map((h) => ({ id: h.id, name: h.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    issues: [],
    rosterCount: labels.size,
    pastoral: null,
    watch: null,
    rest: null,
    warnings: null,
  };
  const options = {
    pageSize: 500,
    maxPages: 80,
    revalidate: 60,
    requireComplete: true,
  };
  const anchor = new Date(end);
  const trendStart = weekRange(anchor, -7).start;
  const fetchStart = new Date(
    Math.min(+trendStart, Date.parse(start)),
  ).toISOString();
  const warningKey = weekKey(anchor);
  const results = await Promise.allSettled([
    listPastoralTimeline(fetchStart, end, options),
    Promise.all([getTracking(), getTargets()]),
    Promise.all([
      listLocationRecordTimeline(
        new Date(Date.parse(start) - 31 * 86400_000).toISOString(),
        end,
        options,
      ),
      resolveHealthCenterLocationIds(),
      live
        ? orahCall<{ data: OrahLocationRecord[] }>(
            "/open-api/location-record/get-current",
          ).then((r) => {
            if (!Array.isArray(r.data))
              throw new Error("Current locations unavailable");
            return r.data;
          })
        : Promise.resolve(null),
    ]),
    warningsAccess
      ? getWarningsForWeek({
          weekKey: warningKey,
          dorm: dormId === null ? undefined : houseMap.get(dormId),
          includeOutstanding: true,
          cutoffISO: end,
          strictConversations: true,
        })
      : Promise.reject(new Error("Warnings access restricted")),
  ] as const);
  const [pastoral, watch, rest, warnings] = results;
  if (pastoral.status === "fulfilled") {
    const records = [
      ...new Map(pastoral.value.map((r) => [r.id, r])).values(),
    ].filter(
      (r) =>
        !r.sensitive &&
        labels.has(r.student.id) &&
        Number.isFinite(Date.parse(r.date)),
    );
    const selected = records.filter(
      (r) =>
        Date.parse(r.date) >= Date.parse(start) &&
        Date.parse(r.date) <= Date.parse(end),
    );
    const categories = new Map<string, number>();
    for (const r of selected) {
      const c = r.pastoral_category?.name ?? "Uncategorised";
      categories.set(c, (categories.get(c) ?? 0) + 1);
    }
    const dayCounts = new Map<string, number>();
    const weekCounts = new Map<string, number>();
    for (const r of selected) {
      const key = localDay(new Date(r.date));
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    }
    for (const r of records) {
      const key = weekKey(new Date(r.date));
      weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
    }
    const days: { label: string; count: number }[] = [];
    // Use UTC noon for calendar labels, avoiding daylight-saving shifts.
    for (
      let d = new Date(`${localDay(new Date(start))}T12:00:00Z`);
      d.toISOString().slice(0, 10) <= localDay(new Date(end));
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const label = d.toISOString().slice(0, 10);
      days.push({ label, count: dayCounts.get(label) ?? 0 });
    }
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const label = weekKey(weekRange(anchor, i - 7).start);
      return { label, count: weekCounts.get(label) ?? 0 };
    });
    data.pastoral = {
      total: selected.length,
      students: new Set(selected.map((r) => r.student.id)).size,
      categories: [...categories]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count),
      days,
      weeks,
      dorms: houses
        .filter((h) => dormId === null || h.id === dormId)
        .map((h) => {
          const roster = [...labels.values()].filter(
            (s) => s.dormId === h.id,
          ).length;
          const rows = selected.filter(
            (r) => labels.get(r.student.id)?.dormId === h.id,
          );
          return {
            label: h.name,
            count: rows.length,
            students: new Set(rows.map((r) => r.student.id)).size,
            roster,
            per100: roster
              ? Math.round((rows.length / roster) * 1000) / 10
              : null,
          };
        }),
      records: selected
        .map((r) => ({
          ...labels.get(r.student.id)!,
          id: r.id,
          category: r.pastoral_category?.name ?? "Uncategorised",
          date: r.date,
          description: r.description ?? "",
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    };
  } else
    data.issues.push("Pastoral records unavailable. No zero totals assumed.");
  if (watch.status === "fulfilled") {
    const [state, settings] = watch.value;
    const episodes = (state?.episodes ?? [])
      .filter((e) => labels.has(e.studentId))
      .map((e) => ({ ...e, ...labels.get(e.studentId)! }));
    const canonicalTargets = Object.fromEntries(
      episodes
        .map((e) => [
          e.category,
          Object.entries(settings.targets).find(
            ([c]) => c.toLowerCase() === e.category.toLowerCase(),
          )?.[1],
        ])
        .filter((e) => e[1] !== undefined),
    ) as Record<string, number>;
    data.watch = {
      startedAt: state?.startedAt ?? null,
      observedAt: state?.observedAt ?? null,
      targets: settings.targets,
      categories: [
        ...new Set([
          ...defaultCategories,
          ...Object.keys(settings.targets),
          ...episodes.map((e) => e.category),
        ]),
      ],
      metrics: watchMetrics(episodes, start, end, canonicalTargets),
      episodes,
    };
  } else
    data.issues.push(
      "Watchlist history unavailable. Check storage configuration.",
    );
  if (rest.status === "fulfilled") {
    const [movements, hc, current] = rest.value;
    const roomIds = (process.env.HC_REST_LOCATION_IDS ?? "")
      .split(",")
      .filter((v) => /^\d+$/.test(v.trim()))
      .map(Number);
    const pattern = process.env.HC_REST_LOCATION_PATTERN ?? "rest";
    const visits = restVisits(
      movements.filter((r) => labels.has(r.student.id)),
      start,
      end,
      hc.ids,
      roomIds,
      pattern,
      (current ?? []).filter((r) => labels.has(r.student.id)),
    ).map((v) => ({ ...v, ...labels.get(v.studentId)! }));
    const currentStudents = [
      ...new Map(
        (current ?? [])
          .filter((r) => r.type === "in" && labels.has(r.student.id))
          .sort((a, b) => a.record_time.localeCompare(b.record_time))
          .map((r) => [r.student.id, r]),
      ).values(),
    ].flatMap((r) => {
      const kind = restKind(r.location, hc.ids, roomIds, pattern);
      return kind
        ? [{ ...labels.get(r.student.id)!, kind, since: r.record_time }]
        : [];
    });
    data.rest = {
      summary: restSummary(visits),
      visits,
      now:
        current === null
          ? null
          : {
              health: currentStudents.filter((s) => s.kind === "health").length,
              room: currentStudents.filter((s) => s.kind === "room").length,
              students: currentStudents,
            },
    };
  } else
    data.issues.push(
      "Rest and Health Center data unavailable. No zero totals assumed.",
    );
  if (warnings.status === "fulfilled")
    data.warnings = {
      week: warningKey,
      students: warnings.value.students.filter((s) => labels.has(s.studentId)),
      threshold: warnings.value.meta.threshold,
    };
  else
    data.issues.push(
      warningsAccess
        ? "Conversation logs unavailable. Follow-up status cannot be verified."
        : "Warning conversations require separate warnings access.",
    );
  return data;
}
