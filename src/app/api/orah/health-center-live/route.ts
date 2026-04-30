// Today's HC roster: every student who was in a Health Center / Nursery /
// Infirmary location, or on a "rest in room" pass, since the most recent
// 05:00 Europe/Zurich boundary. Resets daily. Combines the location-record
// timeline (events today) with get-current (still-in roster) so that
// students who came in yesterday and never left still appear.

import { NextResponse } from "next/server";

import { TZDate } from "@date-fns/tz";

import { auth } from "@/lib/auth";
import { OrahError, isMockMode, orahCall } from "@/lib/orah";
import {
  buildHouseMap,
  buildStudentMap,
  listHouses,
  listLocationRecordTimeline,
  listStudents,
  resolveHealthCenterLocationIds,
  studentDisplayName,
} from "@/lib/orah-resources";
import { HC_STUDENTS } from "@/lib/mock";
import type { OrahEnvelope, OrahLocationRecord } from "@/types/orah";

export const dynamic = "force-dynamic";
export const revalidate = 30;

const TZ = "Europe/Zurich";
const DAY_BOUNDARY_HOUR = 5;

interface DashboardHCStudent {
  id: number;
  name: string;
  initials: string;
  dorm: string;
  roomNumber?: string;
  reason: string;
  location: string;
  locationId: number;
  isRestInRoom: boolean;
  status: "in" | "discharged";
  checkInISO: string;
  checkOutISO?: string;
  durationMinutes: number;
}

function parseIdList(env: string | undefined): number[] {
  if (!env) return [];
  return env
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
}

// Returns [startISO, endISO] for today's HC window: most recent
// 05:00 Europe/Zurich → now. If we're currently before 05:00,
// the window starts at yesterday's 05:00.
function todayHcWindow(now: Date = new Date()): {
  startISO: string;
  endISO: string;
} {
  const local = new TZDate(now, TZ);
  const boundary = new TZDate(local, TZ);
  boundary.setHours(DAY_BOUNDARY_HOUR, 0, 0, 0);
  if (local.getTime() < boundary.getTime()) {
    boundary.setDate(boundary.getDate() - 1);
  }
  return {
    startISO: new Date(boundary.getTime()).toISOString(),
    endISO: now.toISOString(),
  };
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isMockMode()) {
    const now = new Date().toISOString();
    return NextResponse.json({
      students: HC_STUDENTS.map((s, i) => ({
        id: s.id,
        name: s.initials,
        initials: s.initials,
        dorm: s.dorm,
        reason: s.reason,
        location: "Health Center",
        locationId: 0,
        isRestInRoom: false,
        status: i === 0 ? ("discharged" as const) : ("in" as const),
        checkInISO: now,
        checkOutISO: i === 0 ? now : undefined,
        durationMinutes: 30 + i * 15,
      })),
      pulledAt: now,
      source: "mock",
    });
  }

  try {
    const { startISO, endISO } = todayHcWindow();

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
      if (restPattern && loc.name?.toLowerCase().includes(restPattern)) {
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

    const [timeline, currentResp, students, houses] = await Promise.all([
      listLocationRecordTimeline(startISO, endISO, {
        pageSize: 500,
        maxPages: 20,
      }),
      orahCall<OrahEnvelope<OrahLocationRecord[]>>(
        "/open-api/location-record/get-current",
      ),
      listStudents(),
      listHouses(),
    ]);

    const studentMap = buildStudentMap(students);
    const houseMap = buildHouseMap(houses);

    const inHcNow = new Map<number, OrahLocationRecord>();
    for (const r of currentResp.data ?? []) {
      if (r.type === "in" && matchesHcLocation(r.location)) {
        inHcNow.set(r.student.id, r);
      }
    }

    const eventsByStudent = new Map<number, OrahLocationRecord[]>();
    for (const r of timeline) {
      if (!matchesHcLocation(r.location)) continue;
      const arr = eventsByStudent.get(r.student.id);
      if (arr) arr.push(r);
      else eventsByStudent.set(r.student.id, [r]);
    }
    for (const list of eventsByStudent.values()) {
      list.sort((a, b) => a.record_time.localeCompare(b.record_time));
    }

    // Union of "events today" and "currently in HC".
    const allStudentIds = new Set<number>([
      ...eventsByStudent.keys(),
      ...inHcNow.keys(),
    ]);

    const startMs = new Date(startISO).getTime();
    const endMs = new Date(endISO).getTime();
    const out: DashboardHCStudent[] = [];

    for (const studentId of allStudentIds) {
      const events = eventsByStudent.get(studentId) ?? [];
      const stillIn = inHcNow.get(studentId);

      // Build closed intervals + an optionally-open last interval.
      const intervals: Array<{
        inMs: number;
        outMs: number | null;
        rec: OrahLocationRecord;
      }> = [];
      let openIn: { ms: number; rec: OrahLocationRecord } | null = null;
      for (const e of events) {
        const t = new Date(e.record_time).getTime();
        if (e.type === "in") {
          if (openIn) {
            // Two ins in a row: close the previous as a zero-length close.
            intervals.push({ inMs: openIn.ms, outMs: t, rec: openIn.rec });
          }
          openIn = { ms: t, rec: e };
        } else {
          // out
          if (openIn) {
            intervals.push({ inMs: openIn.ms, outMs: t, rec: openIn.rec });
            openIn = null;
          } else {
            // Out with no preceding in today → student was in since
            // before window start; treat startMs as implicit in.
            intervals.push({ inMs: startMs, outMs: t, rec: e });
          }
        }
      }

      if (openIn) {
        intervals.push({ inMs: openIn.ms, outMs: null, rec: openIn.rec });
      } else if (stillIn && intervals.length === 0) {
        // No events today but still in per get-current. Treat startMs
        // as implicit in time so the row still appears with a duration.
        intervals.push({ inMs: startMs, outMs: null, rec: stillIn });
      }

      if (intervals.length === 0) continue;

      let totalMs = 0;
      for (const it of intervals) {
        const close = it.outMs ?? endMs;
        totalMs += Math.max(0, close - it.inMs);
      }
      const durationMinutes = Math.max(0, Math.round(totalMs / 60_000));

      const isCurrentlyIn = Boolean(stillIn) || intervals.at(-1)!.outMs === null;
      const last = intervals.at(-1)!;
      const primaryRec = stillIn ?? last.rec;

      const student = studentMap.get(studentId);
      const { full, initials } = studentDisplayName(student);
      const dorm = student?.house?.id
        ? houseMap.get(student.house.id) ?? "—"
        : "—";
      const roomNumber = student?.room_number?.trim() || undefined;
      const rest = isRestLocation(primaryRec.location);
      const locationName = primaryRec.location?.name ?? "Health Center";

      out.push({
        id: studentId,
        name: full,
        initials,
        dorm,
        roomNumber,
        reason: rest ? `Rest pass — ${locationName}` : `In ${locationName}`,
        location: locationName,
        locationId: primaryRec.location?.id ?? 0,
        isRestInRoom: rest,
        status: isCurrentlyIn ? "in" : "discharged",
        checkInISO: new Date(last.inMs).toISOString(),
        checkOutISO: isCurrentlyIn
          ? undefined
          : new Date(last.outMs!).toISOString(),
        durationMinutes,
      });
    }

    return NextResponse.json({
      students: out,
      window: { startISO, endISO, label: "Today since 05:00 Europe/Zurich" },
      hcLocations: { ids: hc.ids, via: hc.via },
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
