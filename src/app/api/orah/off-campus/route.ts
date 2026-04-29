// Live snapshot of students whose current location has state
// off_grounds or home. Joins location-record/get-current with
// the location/tree response so we can filter by location state
// (which doesn't appear on the location record itself).

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { OrahError, isMockMode, orahCall } from "@/lib/orah";
import {
  buildHouseMap,
  buildStudentMap,
  listHouses,
  listLocationsFlat,
  listStudents,
  studentDisplayName,
} from "@/lib/orah-resources";
import type { OrahEnvelope, OrahLocationRecord } from "@/types/orah";

export const dynamic = "force-dynamic";
export const revalidate = 30;

interface OffCampusStudent {
  id: number;
  name: string;
  initials: string;
  dorm: string;
  location: string;
  locationId: number;
  state: "off_grounds" | "home";
  since: string;
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isMockMode()) {
    return NextResponse.json({
      students: [],
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  try {
    const [currentResp, locations, students, houses] = await Promise.all([
      orahCall<OrahEnvelope<OrahLocationRecord[]>>(
        "/open-api/location-record/get-current",
      ),
      listLocationsFlat(),
      listStudents(),
      listHouses(),
    ]);

    const stateById = new Map<number, OrahLocation_State>();
    for (const loc of locations) {
      if (loc.state === "off_grounds" || loc.state === "home") {
        stateById.set(loc.id, loc.state);
      }
    }

    const studentMap = buildStudentMap(students);
    const houseMap = buildHouseMap(houses);

    const seen = new Set<number>();
    const out: OffCampusStudent[] = [];
    for (const r of currentResp.data ?? []) {
      if (r.type !== "in" || !r.location) continue;
      const state = stateById.get(r.location.id);
      if (!state) continue;
      if (seen.has(r.student.id)) continue;
      seen.add(r.student.id);

      const student = studentMap.get(r.student.id);
      const { full, initials } = studentDisplayName(student);
      const dorm = student?.house?.id
        ? houseMap.get(student.house.id) ?? "—"
        : "—";
      const since = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Zurich",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(r.record_time));

      out.push({
        id: r.student.id,
        name: full,
        initials,
        dorm,
        location: r.location.name,
        locationId: r.location.id,
        state,
        since,
      });
    }

    out.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      students: out,
      counts: {
        offGrounds: out.filter((s) => s.state === "off_grounds").length,
        home: out.filter((s) => s.state === "home").length,
        total: out.length,
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

type OrahLocation_State = "off_grounds" | "home";
