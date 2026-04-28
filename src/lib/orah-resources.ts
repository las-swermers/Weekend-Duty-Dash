// Shared lookups against Orah used by multiple route handlers:
// houses, students, locations. Each is fetched server-side and cached
// for a short window so the four dashboard endpoints don't hammer
// Orah independently.

import { OrahError, orahCall } from "@/lib/orah";
import type {
  OrahEnvelope,
  OrahHouse,
  OrahLocation,
  OrahPastoralRecord,
  OrahStudent,
} from "@/types/orah";

const HOUSE_TTL = 600; // seconds
const STUDENT_TTL = 600;
const LOCATION_TTL = 3600;

export async function listHouses(): Promise<OrahHouse[]> {
  const res = await orahCall<OrahEnvelope<OrahHouse[]>>(
    "/open-api/house/list",
    {},
    { revalidate: HOUSE_TTL },
  );
  return res.data ?? [];
}

export async function listStudents(): Promise<OrahStudent[]> {
  const res = await orahCall<OrahEnvelope<OrahStudent[]>>(
    "/open-api/student/list",
    {},
    { revalidate: STUDENT_TTL },
  );
  return res.data ?? [];
}

export async function listLocationsFlat(): Promise<OrahLocation[]> {
  // location/tree returns top-level zones (On Ground / Off Ground / Home)
  // each with child_locations summaries. We pass nested:false to get a
  // flat list of all locations as siblings.
  const res = await orahCall<OrahEnvelope<OrahLocation[]>>(
    "/open-api/location/tree",
    { query: { nested: false } },
    { revalidate: LOCATION_TTL },
  );
  return res.data ?? [];
}

// Resolve the Health Center's location id. Order of precedence:
//   1. HEALTH_CENTER_LOCATION_ID env var (numeric).
//   2. Find by name match against HEALTH_CENTER_LOCATION_NAME (default
//      "Health Center"), case-insensitive substring.
// Caches the resolved id in module scope for the lifetime of the
// serverless instance.
let cachedHcId: number | null = null;
let cachedHcResolution: { id: number; via: string; name?: string } | null =
  null;

export async function resolveHealthCenterId(): Promise<{
  id: number;
  via: string;
  name?: string;
}> {
  if (cachedHcResolution) return cachedHcResolution;

  const envId = process.env.HEALTH_CENTER_LOCATION_ID;
  if (envId && /^\d+$/.test(envId)) {
    cachedHcId = Number(envId);
    cachedHcResolution = { id: cachedHcId, via: "env" };
    return cachedHcResolution;
  }

  const target = (
    process.env.HEALTH_CENTER_LOCATION_NAME ?? "Health Center"
  ).toLowerCase();

  const all = await listLocationsFlat();
  // Search top-level + their child_locations for any name containing the
  // target string.
  const candidates: Array<{ id: number; name: string }> = [];
  for (const loc of all) {
    if (loc.name && loc.name.toLowerCase().includes(target)) {
      candidates.push({ id: loc.id, name: loc.name });
    }
    for (const child of loc.child_locations ?? []) {
      if (child.name && child.name.toLowerCase().includes(target)) {
        candidates.push({ id: child.id, name: child.name });
      }
    }
  }

  if (candidates.length === 0) {
    throw new OrahError(
      404,
      `No location matched "${target}". Set HEALTH_CENTER_LOCATION_ID env var with the numeric id (visit /api/orah/locations to list).`,
    );
  }
  if (candidates.length > 1) {
    throw new OrahError(
      409,
      `Multiple locations matched "${target}" (${candidates
        .map((c) => `${c.name}#${c.id}`)
        .join(", ")}). Set HEALTH_CENTER_LOCATION_ID env var to disambiguate.`,
    );
  }

  cachedHcId = candidates[0].id;
  cachedHcResolution = {
    id: candidates[0].id,
    via: "name-match",
    name: candidates[0].name,
  };
  return cachedHcResolution;
}

export function buildHouseMap(houses: OrahHouse[]): Map<number, string> {
  return new Map(houses.map((h) => [h.id, h.name]));
}

export function buildStudentMap(
  students: OrahStudent[],
): Map<number, OrahStudent> {
  return new Map(students.map((s) => [s.id, s]));
}

// Paginate through pastoral/timeline for a date range, stopping when a
// page returns fewer records than requested (or after maxPages as a
// safety bound).
export async function listPastoralTimeline(
  startISO: string,
  endISO?: string,
  opts: { pageSize?: number; maxPages?: number; revalidate?: number } = {},
): Promise<OrahPastoralRecord[]> {
  const pageSize = opts.pageSize ?? 50;
  const maxPages = opts.maxPages ?? 20;
  const out: OrahPastoralRecord[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const res = await orahCall<OrahEnvelope<OrahPastoralRecord[]>>(
      "/open-api/pastoral/timeline",
      {
        query: {
          date_range: endISO
            ? { start_date: startISO, end_date: endISO }
            : { start_date: startISO },
          page_size: pageSize,
          page_index: page,
        },
      },
      { revalidate: opts.revalidate },
    );
    const records = res.data ?? [];
    out.push(...records);
    if (records.length < pageSize) break;
  }
  return out;
}

export function studentDisplayName(s: OrahStudent | undefined): {
  full: string;
  initials: string;
} {
  if (!s) return { full: "Unknown", initials: "??" };
  const first = (s.alt_name?.trim() || s.first_name?.trim()) ?? "";
  const last = s.last_name?.trim() ?? "";
  const full = `${first} ${last}`.trim() || `Student #${s.id}`;
  const initials =
    `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "??";
  return { full, initials };
}
