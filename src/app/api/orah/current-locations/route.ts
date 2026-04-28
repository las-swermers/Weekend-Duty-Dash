// Live aggregation of current location records, grouped by location.
// Used to discover which Orah locations are actually in use at LAS
// (the location/tree response filters to user-facing zones; pass /
// leave-driven locations like "Savoy Health Center" don't appear
// there but do show up in location records).

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { OrahError, orahCall } from "@/lib/orah";
import {
  buildHouseMap,
  buildStudentMap,
  listHouses,
  listStudents,
  studentDisplayName,
} from "@/lib/orah-resources";
import type { OrahEnvelope, OrahLocationRecord } from "@/types/orah";

export const dynamic = "force-dynamic";

interface Bucket {
  locationId: number;
  locationName: string;
  count: number;
  sampleStudents: string[];
  studentIds: number[];
  recordTypes: Record<string, number>;
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [recordsResp, students, houses] = await Promise.all([
      orahCall<OrahEnvelope<OrahLocationRecord[]>>(
        "/open-api/location-record/get-current",
      ),
      listStudents(),
      listHouses(),
    ]);

    const studentMap = buildStudentMap(students);
    const houseMap = buildHouseMap(houses);

    const buckets = new Map<string, Bucket>();

    for (const r of recordsResp.data ?? []) {
      if (!r.location) continue;
      const key = `${r.location.id}:${r.location.name}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          locationId: r.location.id,
          locationName: r.location.name,
          count: 0,
          sampleStudents: [],
          studentIds: [],
          recordTypes: {},
        };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      bucket.studentIds.push(r.student.id);
      bucket.recordTypes[r.type] = (bucket.recordTypes[r.type] ?? 0) + 1;
      if (bucket.sampleStudents.length < 3) {
        const s = studentMap.get(r.student.id);
        const { full } = studentDisplayName(s);
        const dorm = s?.house?.id
          ? houseMap.get(s.house.id) ?? "—"
          : "—";
        bucket.sampleStudents.push(`${full} (${dorm})`);
      }
    }

    const sorted = Array.from(buckets.values()).sort(
      (a, b) => b.count - a.count,
    );

    return NextResponse.json({
      totalRecords: recordsResp.data?.length ?? 0,
      uniqueLocations: sorted.length,
      buckets: sorted.map(({ studentIds: _ignored, ...rest }) => rest),
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
