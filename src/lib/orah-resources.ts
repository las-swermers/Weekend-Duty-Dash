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

// Resolve the set of Health Center / Nursery / Infirmary location ids.
// LAS has a per-dorm HC layout (e.g. "Savoy Health Center", "BE Nursery"),
// so this returns an array, not a single id. Order of precedence:
//   1. HEALTH_CENTER_LOCATION_IDS env var (comma-separated numeric ids).
//   2. HEALTH_CENTER_LOCATION_ID env var (single id, back-compat).
//   3. Auto-detect: any location whose name matches HC patterns
//      ("Health Center", "Nursery", "Infirmary", "Sick Bay") plus any
//      additional patterns supplied via HEALTH_CENTER_NAME_PATTERNS
//      (CSV of substrings, case-insensitive).
const HC_PATTERNS = [
  /health\s*cent(?:er|re)/i,
  /nursery/i,
  /infirmary/i,
  /sick\s*bay/i,
  /wellness/i,
];

export interface HCResolution {
  ids: number[];
  idToName: Map<number, string>;
  via: "env-ids" | "env-id" | "name-match";
}

let cachedHc: HCResolution | null = null;

export async function resolveHealthCenterLocationIds(): Promise<HCResolution> {
  if (cachedHc) return cachedHc;

  const plural = process.env.HEALTH_CENTER_LOCATION_IDS;
  if (plural) {
    const ids = plural
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length > 0) {
      cachedHc = { ids, idToName: new Map(), via: "env-ids" };
      return cachedHc;
    }
  }

  const single = process.env.HEALTH_CENTER_LOCATION_ID;
  if (single && /^\d+$/.test(single)) {
    cachedHc = { ids: [Number(single)], idToName: new Map(), via: "env-id" };
    return cachedHc;
  }

  const extra = (process.env.HEALTH_CENTER_NAME_PATTERNS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new RegExp(s, "i"));
  const patterns = [...HC_PATTERNS, ...extra];

  const all = await listLocationsFlat();
  const matches = new Map<number, string>();
  const consider = (id: number, name: string | undefined) => {
    if (!name) return;
    if (patterns.some((p) => p.test(name))) matches.set(id, name);
  };

  for (const loc of all) {
    consider(loc.id, loc.name);
    for (const child of loc.child_locations ?? []) {
      consider(child.id, child.name);
    }
  }

  if (matches.size === 0) {
    throw new OrahError(
      404,
      "No locations matched HC patterns. Set HEALTH_CENTER_LOCATION_IDS (comma-separated ids from /api/orah/locations) or extend HEALTH_CENTER_NAME_PATTERNS.",
    );
  }

  cachedHc = {
    ids: Array.from(matches.keys()),
    idToName: matches,
    via: "name-match",
  };
  return cachedHc;
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
