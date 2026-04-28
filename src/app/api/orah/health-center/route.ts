// Live: students currently signed into any Health Center / Nursery /
// Infirmary location, enriched with name + dorm + which HC they're in.
// Calls /open-api/location-record/get-current and filters client-side
// to the resolved set of HC location ids (LAS has a per-dorm HC layout
// so the resolver returns an array, not a single id).

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
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
        location: "Health Center",
        locationId: 0,
      })),
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  try {
    const hc = await resolveHealthCenterLocationIds();
    const hcSet = new Set(hc.ids);

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
      (r) => r.type === "in" && r.location && hcSet.has(r.location.id),
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
        location: r.location.name,
        locationId: r.location.id,
      };
    });

    out.sort((a, b) => a.name.localeCompare(b.name));

    // Group by location for the meta block (useful for the snapshot
    // email and any "X in Savoy HC, Y in BE Nursery" UI later).
    const byLocation = new Map<string, number>();
    for (const s of out) {
      byLocation.set(s.location, (byLocation.get(s.location) ?? 0) + 1);
    }

    return NextResponse.json({
      students: out,
      meta: {
        hcLocationIds: hc.ids,
        resolvedVia: hc.via,
        byLocation: Object.fromEntries(byLocation),
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
