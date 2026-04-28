// Retrospective lookup of location-record events.
// Usage:
//   /api/orah/location-history?location_ids=9167,9169&days=7
//   /api/orah/location-history?location_ids=1721&from=2026-05-01&to=2026-05-03
//
// Returns every in/out event in the window, optionally filtered to the
// given location ids, enriched with student name / dorm. Useful for:
//   - validating that pass-driven location records are actually firing
//     (hit it with the HC ids over the past week)
//   - the "who was at X on Friday" weekend snapshot the dashboard
//     ultimately builds Travel + Trips on top of

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { OrahError } from "@/lib/orah";
import {
  buildHouseMap,
  buildStudentMap,
  listHouses,
  listLocationRecordTimeline,
  listStudents,
  studentDisplayName,
} from "@/lib/orah-resources";

export const dynamic = "force-dynamic";

function parseIds(raw: string | null): Set<number> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const ids = parseIds(params.get("location_ids"));
  const days = Math.max(1, Math.min(60, Number(params.get("days")) || 7));

  const fromParam = parseDate(params.get("from"));
  const toParam = parseDate(params.get("to"));

  let startIso: string;
  let endIso: string | undefined;
  if (fromParam) {
    startIso = fromParam.toISOString();
    endIso = toParam ? toParam.toISOString() : undefined;
  } else {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - days);
    start.setUTCHours(0, 0, 0, 0);
    startIso = start.toISOString();
  }

  try {
    const [records, students, houses] = await Promise.all([
      listLocationRecordTimeline(startIso, endIso),
      listStudents(),
      listHouses(),
    ]);

    const studentMap = buildStudentMap(students);
    const houseMap = buildHouseMap(houses);

    const filtered =
      ids.size > 0
        ? records.filter((r) => r.location && ids.has(r.location.id))
        : records;

    const enriched = filtered
      .map((r) => {
        const student = studentMap.get(r.student.id);
        const { full, initials } = studentDisplayName(student);
        return {
          recordId: r.id,
          type: r.type,
          time: r.record_time,
          locationId: r.location?.id,
          locationName: r.location?.name ?? "—",
          studentId: r.student.id,
          studentName: full,
          initials,
          dorm: student?.house?.id
            ? houseMap.get(student.house.id) ?? "—"
            : "—",
        };
      })
      .sort((a, b) => b.time.localeCompare(a.time));

    const byLocation: Record<string, number> = {};
    const byStudent: Record<string, number> = {};
    for (const r of enriched) {
      byLocation[r.locationName] = (byLocation[r.locationName] ?? 0) + 1;
      byStudent[r.studentName] = (byStudent[r.studentName] ?? 0) + 1;
    }

    return NextResponse.json({
      window: { start: startIso, end: endIso ?? null, days },
      filter: { locationIds: Array.from(ids) },
      counts: {
        totalScanned: records.length,
        afterFilter: filtered.length,
      },
      summary: { byLocation, byStudent },
      records: enriched,
      pulledAt: new Date().toISOString(),
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
