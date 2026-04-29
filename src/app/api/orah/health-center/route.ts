// Snapshot: students who spent time in a Health Center / Nursery /
// Infirmary location, or on a "rest in room" pass, during Friday of
// the current weekend (Europe/Zurich). Reads location-record/timeline
// for the Friday window only, pairs "in"/"out" events per student, and
// reports total minutes spent in HC on Friday.
//
// LAS has a per-dorm HC layout, so the location resolver returns an
// array of ids. Rest-pass locations are matched either via
// HC_REST_LOCATION_IDS (numeric) or HC_REST_LOCATION_PATTERN (substring,
// default "rest").

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { fridayOfCurrentWeekend } from "@/lib/dates";
import { OrahError, isMockMode, orahCall } from "@/lib/orah";
import {
  buildHouseMap,
  buildStudentMap,
  listHouses,
  listStudents,
  resolveHealthCenterLocationIds,
  studentDisplayName,
} from "@/lib/orah-resources";
import { HC_STUDENTS } from "@/lib/mock";
import type { OrahEnvelope, OrahLocationRecord } from "@/types/orah";

export const dynamic = "force-dynamic";
export const revalidate = 60;

interface DashboardHCStudent {
  id: number;
  name: string;
  initials: string;
  dorm: string;
  reason: string;
  since: string;
  status: "in" | "overnight";
  location: string;
  locationId: number;
}

function parseIdList(env: string | undefined): number[] {
  if (!env) return [];
  return env
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
}

function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

async function fetchTimeline(
  startISO: string,
  endISO: string,
): Promise<OrahLocationRecord[]> {
  const all: OrahLocationRecord[] = [];
  let pageIndex = 0;
  const pageSize = 500;
  while (pageIndex < 20) {
    const resp = await orahCall<OrahEnvelope<OrahLocationRecord[]>>(
      "/open-api/location-record/timeline",
      {
        query: {
          date_range: { start_date: startISO, end_date: endISO },
        },
        page_size: pageSize,
        page_index: pageIndex,
      },
    );
    const batch = resp.data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    pageIndex += 1;
  }
  return all;
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isMockMode()) {
    return NextResponse.json({
      students: HC_STUDENTS.map((s) => ({
        id: s.id,
        name: s.initials,
        initials: s.initials,
        dorm: s.dorm,
        reason: s.reason,
        since: s.since,
        status: s.status,
        location: "Health Center",
        locationId: 0,
      })),
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  try {
    const friday = fridayOfCurrentWeekend();
    const startISO = friday.start.toISOString();
    const endISO = friday.end.toISOString();

    const hc = await resolveHealthCenterLocationIds();
    const hcSet = new Set(hc.ids);
    const restIds = new Set(parseIdList(process.env.HC_REST_LOCATION_IDS));
    const restPattern = (
      process.env.HC_REST_LOCATION_PATTERN ?? "rest"
    ).toLowerCase();

    const matchesHcLocation = (loc?: { id: number; name?: string }) => {
      if (!loc) return false;
      if (hcSet.has(loc.id)) return true;
      if (restIds.has(loc.id)) return true;
      if (
        restPattern &&
        loc.name?.toLowerCase().includes(restPattern)
      ) {
        return true;
      }
      return false;
    };

    const isRestLocation = (loc?: { id: number; name?: string }) => {
      if (!loc) return false;
      if (hcSet.has(loc.id)) return false;
      if (restIds.has(loc.id)) return true;
      if (restPattern && loc.name?.toLowerCase().includes(restPattern)) {
        return true;
      }
      return false;
    };

    const [timeline, students, houses] = await Promise.all([
      fetchTimeline(startISO, endISO),
      listStudents(),
      listHouses(),
    ]);

    const studentMap = buildStudentMap(students);
    const houseMap = buildHouseMap(houses);

    const fridayMatches = timeline.filter((r) =>
      matchesHcLocation(r.location),
    );

    const fridayStartMs = friday.start.getTime();
    const fridayEndMs = friday.end.getTime();

    const recordsByStudent = new Map<number, OrahLocationRecord[]>();
    for (const r of fridayMatches) {
      const arr = recordsByStudent.get(r.student.id);
      if (arr) arr.push(r);
      else recordsByStudent.set(r.student.id, [r]);
    }

    const out: DashboardHCStudent[] = [];
    for (const [studentId, records] of recordsByStudent) {
      records.sort((a, b) => a.record_time.localeCompare(b.record_time));

      let totalMs = 0;
      let openInTime: number | null = null;
      let stillIn = false;
      let primary: OrahLocationRecord = records[0];
      for (const r of records) {
        if (r.type === "in") primary = r;
      }

      for (const r of records) {
        const t = new Date(r.record_time).getTime();
        if (r.type === "in") {
          if (openInTime === null) openInTime = Math.max(t, fridayStartMs);
        } else {
          // out: close an open interval, or treat start of Friday as
          // implicit in time if the student was already in HC overnight.
          const startMs = openInTime ?? fridayStartMs;
          totalMs += Math.max(0, Math.min(t, fridayEndMs) - startMs);
          openInTime = null;
        }
      }
      if (openInTime !== null) {
        totalMs += Math.max(0, fridayEndMs - openInTime);
        stillIn = true;
      }

      if (totalMs <= 0) continue;

      const student = studentMap.get(studentId);
      const { full, initials } = studentDisplayName(student);
      const dorm = student?.house?.id
        ? houseMap.get(student.house.id) ?? "—"
        : "—";
      const rest = isRestLocation(primary.location);
      out.push({
        id: studentId,
        name: full,
        initials,
        dorm,
        reason: rest
          ? `Rest pass — ${primary.location?.name ?? "in room"}`
          : `In ${primary.location?.name ?? "Health Center"}`,
        since: formatDuration(totalMs),
        status: stillIn ? "overnight" : "in",
        location: primary.location?.name ?? "Health Center",
        locationId: primary.location?.id ?? 0,
      });
    }

    out.sort((a, b) => a.name.localeCompare(b.name));

    const byLocation = new Map<string, number>();
    for (const s of out) {
      byLocation.set(s.location, (byLocation.get(s.location) ?? 0) + 1);
    }

    return NextResponse.json({
      students: out,
      window: { startISO, endISO, label: "Friday Europe/Zurich" },
      hcLocations: { ids: hc.ids, via: hc.via },
      byLocation: Array.from(byLocation, ([name, count]) => ({ name, count })),
      pulledAt: new Date().toISOString(),
      source: "orah",
    });
  } catch (err) {
    if (err instanceof OrahError) {
      return NextResponse.json(
        { error: err.message, bodyPreview: err.bodyPreview },
        { status: err.status },
      );
    }
    throw err;
  }
}
