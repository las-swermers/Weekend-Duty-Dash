// Live: students currently signed into the Health Center, enriched
// with name + dorm. Calls /open-api/location-record/get-current and
// filters client-side to the configured HC location id.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
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
    const hc = await resolveHealthCenterId();

    const [recordsResp, students, houses] = await Promise.all([
      orahCall<OrahEnvelope<OrahLocationRecord[]>>(
        "/open-api/location-record/get-current",
      ),
      listStudents(),
      listHouses(),
    ]);

    const studentMap = buildStudentMap(students);
    const houseMap = buildHouseMap(houses);

    const records = (recordsResp.data ?? []).filter(
      (r) => r.type === "in" && r.location?.id === hc.id,
    );

    const out: DashboardHCStudent[] = records.map((r) => {
      const student = studentMap.get(r.student.id);
      const { full, initials } = studentDisplayName(student);
      const dorm = student?.house?.id
        ? houseMap.get(student.house.id) ?? "—"
        : "—";
      const { since, status } = describeRecord(r);
      return {
        id: r.id,
        name: full,
        initials,
        dorm,
        reason: "Currently signed in",
        since,
        status,
      };
    });

    return NextResponse.json({
      students: out,
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
