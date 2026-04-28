// Live: students who entered any child of the "Signed Out" zone (id 1721)
// during this weekend's window. We dedupe by student keeping the most
// recent in-record so each student appears once with their latest
// destination.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { OrahError, isMockMode } from "@/lib/orah";
import { currentWeekendRange } from "@/lib/dates";
import {
  buildHouseMap,
  buildStudentMap,
  getZoneAndChildren,
  listHouses,
  listLocationRecordTimeline,
  listStudents,
  studentDisplayName,
} from "@/lib/orah-resources";
import { TRAVEL_REQUESTS } from "@/lib/mock";
import type { OrahLocationRecord } from "@/types/orah";

export const dynamic = "force-dynamic";
export const revalidate = 60;

const SIGNED_OUT_ZONE_ID = 1721;
const ZURICH = "Europe/Zurich";

interface DashboardTravelRequest {
  id: number;
  name?: string;
  initials: string;
  dorm: string;
  destination: string;
  depart: string;
  return: string;
  status: string;
  chaperone: string;
}

function formatZurichDayTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZURICH,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isMockMode()) {
    return NextResponse.json({
      requests: TRAVEL_REQUESTS,
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  try {
    const { start, end } = currentWeekendRange();

    const [signedOut, records, students, houses] = await Promise.all([
      getZoneAndChildren(SIGNED_OUT_ZONE_ID),
      listLocationRecordTimeline(start.toISOString(), end.toISOString()),
      listStudents(),
      listHouses(),
    ]);

    const studentMap = buildStudentMap(students);
    const houseMap = buildHouseMap(houses);

    const latestByStudent = new Map<number, OrahLocationRecord>();
    for (const r of records) {
      if (r.type !== "in") continue;
      if (!r.location || !signedOut.ids.has(r.location.id)) continue;
      const existing = latestByStudent.get(r.student.id);
      if (
        !existing ||
        new Date(r.record_time).getTime() >
          new Date(existing.record_time).getTime()
      ) {
        latestByStudent.set(r.student.id, r);
      }
    }

    const out: DashboardTravelRequest[] = Array.from(
      latestByStudent.values(),
    ).map((r) => {
      const student = studentMap.get(r.student.id);
      const { full, initials } = studentDisplayName(student);
      const dorm = student?.house?.id
        ? houseMap.get(student.house.id) ?? "—"
        : "—";
      return {
        id: r.id,
        name: full,
        initials,
        dorm,
        destination: r.location?.name ?? "—",
        depart: formatZurichDayTime(r.record_time),
        return: "—",
        status: "signed-out",
        chaperone: "—",
      };
    });

    out.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    const byDestination: Record<string, number> = {};
    for (const r of out) {
      byDestination[r.destination] = (byDestination[r.destination] ?? 0) + 1;
    }

    return NextResponse.json({
      requests: out,
      meta: {
        weekend: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        zoneId: SIGNED_OUT_ZONE_ID,
        zoneIdsConsidered: Array.from(signedOut.ids),
        recordsScanned: records.length,
        byDestination,
      },
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
