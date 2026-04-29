// Server-side helpers for pulling and shaping pastoral records for the
// analytics page. Pastoral records are sensitive — only call these
// behind requireAnalyticsAccess().

import { OrahError, orahCall } from "@/lib/orah";
import {
  buildHouseMap,
  buildStudentMap,
  listHouses,
  listStudents,
  studentDisplayName,
} from "@/lib/orah-resources";
import type {
  EnrichedPastoral,
  PastoralAggregations,
  PastoralFilters,
  PastoralMeta,
  PastoralResponse,
} from "@/types/analytics";
import type { OrahEnvelope, OrahPastoralRecord } from "@/types/orah";

const PAGE_SIZE = 500;
const MAX_PAGES = 40;

async function fetchAllPastoral(
  startISO: string,
  endISO: string,
): Promise<OrahPastoralRecord[]> {
  const out: OrahPastoralRecord[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const resp = await orahCall<OrahEnvelope<OrahPastoralRecord[]>>(
      "/open-api/pastoral/timeline",
      {
        query: {
          date_range: { start_date: startISO, end_date: endISO },
        },
        page_size: PAGE_SIZE,
        page_index: page,
      },
    );
    const batch = resp.data ?? [];
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return out;
}

function dayKey(iso: string): string {
  // YYYY-MM-DD in Europe/Zurich.
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export async function getPastoralMeta(
  defaultRange: { start: string; end: string },
): Promise<PastoralMeta> {
  // Use the requested range to surface the categories that actually
  // appear in the visible window. Cheaper than scanning all-time.
  const [records, students, houses] = await Promise.all([
    fetchAllPastoral(defaultRange.start, defaultRange.end).catch(() => []),
    listStudents(),
    listHouses(),
  ]);

  const categories = new Set<string>();
  for (const r of records) {
    if (r.pastoral_category?.name) categories.add(r.pastoral_category.name);
  }

  const yearLevels = new Set<string>();
  for (const s of students) {
    if (s.year_level) yearLevels.add(s.year_level);
  }

  return {
    categories: Array.from(categories).sort(),
    houses: houses
      .map((h) => ({ id: h.id, name: h.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    yearLevels: Array.from(yearLevels).sort(),
    defaultRange,
  };
}

function aggregate(records: EnrichedPastoral[]): PastoralAggregations {
  const byCat = new Map<string, number>();
  const byHouse = new Map<string, number>();
  const byCreator = new Map<string, number>();
  const byDay = new Map<string, number>();
  let watchlistCount = 0;
  let sensitiveCount = 0;
  for (const r of records) {
    const cat = r.category ?? "(uncategorised)";
    byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
    const house = r.house ?? "(no dorm)";
    byHouse.set(house, (byHouse.get(house) ?? 0) + 1);
    const creator = r.createdBy ?? "(unknown)";
    byCreator.set(creator, (byCreator.get(creator) ?? 0) + 1);
    const d = dayKey(r.date);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
    if (r.watchlist) watchlistCount += 1;
    if (r.sensitive) sensitiveCount += 1;
  }

  const sortByCount = <T extends { count: number }>(a: T, b: T) =>
    b.count - a.count;

  return {
    total: records.length,
    byCategory: Array.from(byCat, ([category, count]) => ({
      category,
      count,
    })).sort(sortByCount),
    byHouse: Array.from(byHouse, ([house, count]) => ({ house, count })).sort(
      sortByCount,
    ),
    byCreator: Array.from(byCreator, ([creator, count]) => ({
      creator,
      count,
    })).sort(sortByCount),
    byDay: Array.from(byDay, ([day, count]) => ({ day, count })).sort((a, b) =>
      a.day.localeCompare(b.day),
    ),
    watchlistCount,
    sensitiveCount,
  };
}

export async function queryPastoral(
  filters: PastoralFilters,
): Promise<PastoralResponse> {
  if (!filters.startDate || !filters.endDate) {
    throw new OrahError(400, "startDate and endDate are required");
  }
  if (
    Number.isNaN(Date.parse(filters.startDate)) ||
    Number.isNaN(Date.parse(filters.endDate))
  ) {
    throw new OrahError(400, "startDate / endDate must be ISO timestamps");
  }
  if (Date.parse(filters.startDate) > Date.parse(filters.endDate)) {
    throw new OrahError(400, "startDate must be before endDate");
  }

  const [records, students, houses] = await Promise.all([
    fetchAllPastoral(filters.startDate, filters.endDate),
    listStudents(),
    listHouses(),
  ]);

  const studentMap = buildStudentMap(students);
  const houseMap = buildHouseMap(houses);

  const categorySet = filters.categories?.length
    ? new Set(filters.categories.map((c) => c.toLowerCase()))
    : null;
  const houseIdSet = filters.houseIds?.length
    ? new Set(filters.houseIds)
    : null;
  const yearLevelSet = filters.yearLevels?.length
    ? new Set(filters.yearLevels)
    : null;
  const search = filters.search?.trim().toLowerCase() ?? "";

  let sensitiveRedacted = false;

  const enriched: EnrichedPastoral[] = [];
  for (const r of records) {
    if (r.sensitive && !filters.includeSensitive) {
      sensitiveRedacted = true;
      continue;
    }
    if (filters.watchlistOnly && !r.watchlist) continue;

    const categoryName = r.pastoral_category?.name ?? null;
    if (
      categorySet &&
      !(categoryName && categorySet.has(categoryName.toLowerCase()))
    ) {
      continue;
    }

    const student = studentMap.get(r.student.id);
    const houseId = student?.house?.id ?? null;
    if (houseIdSet && !(houseId && houseIdSet.has(houseId))) continue;
    if (
      yearLevelSet &&
      !(student?.year_level && yearLevelSet.has(student.year_level))
    ) {
      continue;
    }

    const { full, initials } = studentDisplayName(student);
    const house = houseId ? houseMap.get(houseId) ?? null : null;

    if (search) {
      const haystack = [
        r.description,
        r.action,
        r.note,
        full,
        house ?? "",
        categoryName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) continue;
    }

    enriched.push({
      id: r.id,
      date: r.date,
      category: categoryName,
      description: r.description ?? "",
      action: r.action ?? "",
      note: r.note ?? "",
      watchlist: !!r.watchlist,
      sensitive: !!r.sensitive,
      studentId: r.student.id,
      studentName: full,
      initials,
      yearLevel: student?.year_level ?? null,
      house,
      houseId,
      createdBy: r.created_by?.name ?? null,
    });
  }

  enriched.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    records: enriched,
    aggregations: aggregate(enriched),
    meta: {
      totalFetched: records.length,
      fetchedRange: { start: filters.startDate, end: filters.endDate },
      sensitiveRedacted,
    },
  };
}
