// Live: students who were signed into the Health Center, OR signed
// onto a "rest in room" pass, at any point during Friday of the
// current weekend (Europe/Zurich). Reads location-record/timeline
// for the Friday window plus the live get-current snapshot, merges,
// and dedupes by student.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { fridayOfCurrentWeekend } from "@/lib/dates";
import { OrahError, isMockMode, orahCall } from "@/lib/orah";
import {
  buildHouseMap,
  buildStudentMap,
  listHouses,
  listStudents,
  resolveHealthCenterId,
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
}

function parseIdList(env: string | undefined): number[] {
  if (!env) return [];
  return env
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
}

function describeRecord(rec: OrahLocationRecord): {
  since: string;
  status: "in" | "overnight";
} {
  const recordedAt = new Date(rec.record_time);
  const ageMs = Date.now() - recordedAt.getTime();
  const overnight = ageMs > 12 * 60 * 60 * 1000;
  const since = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(recordedAt);
  return { since, status: overnight ? "overnight" : "in" };
}

async function fetchTimeline(
  startISO: string,
  endISO: string,
): Promise<OrahLocationRecord[]> {
  const all: OrahLocationRecord[] = [];
  let pageIndex = 0;
  const pageSize = 500;
  // Defensive page cap — Orah pages can theoretically grow large; one Friday
  // worth of records on a ~400-student campus shouldn't exceed a few hundred.
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
      })),
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  try {
    const friday = fridayOfCurrentWeekend();
    const startISO = friday.start.toISOString();
    const endISO = friday.end.toISOString();

    const hc = await resolveHealthCenterId();
    const extraHcIds = new Set(parseIdList(process.env.HC_REST_LOCATION_IDS));
    const restPattern = (
      process.env.HC_REST_LOCATION_PATTERN ?? "rest"
    ).toLowerCase();

    const matchesHcLocation = (loc?: { id: number; name?: string }) => {
      if (!loc) return false;
      if (loc.id === hc.id) return true;
      if (extraHcIds.has(loc.id)) return true;
      if (
        restPattern &&
        loc.name?.toLowerCase().includes(restPattern)
      ) {
        return true;
      }
      return false;
    };

    const [timeline, currentResp, students, houses] = await Promise.all([
      fetchTimeline(startISO, endISO),
      orahCall<OrahEnvelope<OrahLocationRecord[]>>(
        "/open-api/location-record/get-current",
      ),
      listStudents(),
      listHouses(),
    ]);

    const studentMap = buildStudentMap(students);
    const houseMap = buildHouseMap(houses);

    // Pick the earliest matching record per student. If no matching record on
    // Friday, fall back to a current-state record (covers students who
    // checked in Thu and are still here without a Friday timeline event).
    const fridayMatches = timeline.filter((r) => matchesHcLocation(r.location));
    const currentMatches = (currentResp.data ?? []).filter(
      (r) => r.type === "in" && matchesHcLocation(r.location),
    );

    const earliestPerStudent = new Map<number, OrahLocationRecord>();
    for (const r of fridayMatches) {
      const existing = earliestPerStudent.get(r.student.id);
      if (
        !existing ||
        new Date(r.record_time) < new Date(existing.record_time)
      ) {
        earliestPerStudent.set(r.student.id, r);
      }
    }
    for (const r of currentMatches) {
      if (!earliestPerStudent.has(r.student.id)) {
        earliestPerStudent.set(r.student.id, r);
      }
    }

    const out: DashboardHCStudent[] = Array.from(
      earliestPerStudent.values(),
    ).map((r) => {
      const student = studentMap.get(r.student.id);
      const { full, initials } = studentDisplayName(student);
      const dorm = student?.house?.id
        ? houseMap.get(student.house.id) ?? "—"
        : "—";
      const { since, status } = describeRecord(r);
      const isRest =
        r.location?.id !== hc.id &&
        (extraHcIds.has(r.location?.id ?? -1) ||
          (restPattern &&
            r.location?.name?.toLowerCase().includes(restPattern)));
      return {
        id: r.student.id,
        name: full,
        initials,
        dorm,
        reason: isRest
          ? `Rest pass — ${r.location?.name ?? "in room"}`
          : `In ${r.location?.name ?? "Health Center"}`,
        since,
        status,
      };
    });

    out.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      students: out,
      window: { startISO, endISO, label: "Friday Europe/Zurich" },
      hcLocation: { id: hc.id, name: hc.name ?? null, via: hc.via },
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
