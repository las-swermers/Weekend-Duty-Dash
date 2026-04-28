// Live: trips happening this weekend, derived from location records
// against any child of the "Student Life Trips" zone (id 2141).
// Aggregates per destination since the dashboard's Trips section
// shows trip-level rows ("Glacier 3000 — 14 students").

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { OrahError, isMockMode } from "@/lib/orah";
import { currentWeekendRange } from "@/lib/dates";
import {
  getZoneAndChildren,
  listLocationRecordTimeline,
} from "@/lib/orah-resources";
import { SCHEDULED_TRIPS } from "@/lib/mock";

export const dynamic = "force-dynamic";
export const revalidate = 60;

const TRIPS_ZONE_ID = 2141;
const ZURICH = "Europe/Zurich";

interface DashboardTrip {
  id: string;
  title: string;
  lead: string;
  count: number;
  depart: string;
  return: string;
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
      trips: SCHEDULED_TRIPS,
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  try {
    const { start, end } = currentWeekendRange();

    const [tripsZone, records] = await Promise.all([
      getZoneAndChildren(TRIPS_ZONE_ID),
      listLocationRecordTimeline(start.toISOString(), end.toISOString()),
    ]);

    // Group records to trip locations. Per location: distinct students,
    // earliest depart time, latest return-or-still-out time.
    interface Bucket {
      locationId: number;
      title: string;
      students: Set<number>;
      firstIn?: string;
      lastEvent?: string;
    }
    const buckets = new Map<number, Bucket>();

    for (const r of records) {
      if (!r.location || !tripsZone.ids.has(r.location.id)) continue;
      // Skip the zone itself (id 2141) — only count specific destinations
      // for trip aggregation.
      if (r.location.id === TRIPS_ZONE_ID) continue;

      let bucket = buckets.get(r.location.id);
      if (!bucket) {
        bucket = {
          locationId: r.location.id,
          title: r.location.name,
          students: new Set(),
        };
        buckets.set(r.location.id, bucket);
      }
      bucket.students.add(r.student.id);
      if (r.type === "in") {
        if (!bucket.firstIn || r.record_time < bucket.firstIn) {
          bucket.firstIn = r.record_time;
        }
      }
      if (!bucket.lastEvent || r.record_time > bucket.lastEvent) {
        bucket.lastEvent = r.record_time;
      }
    }

    const out: DashboardTrip[] = Array.from(buckets.values())
      .filter((b) => b.students.size > 0)
      .map((b) => ({
        id: `trip-${b.locationId}`,
        title: b.title,
        lead: "—",
        count: b.students.size,
        depart: b.firstIn ? formatZurichDayTime(b.firstIn) : "—",
        return: b.lastEvent ? formatZurichDayTime(b.lastEvent) : "—",
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      trips: out,
      meta: {
        weekend: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        zoneId: TRIPS_ZONE_ID,
        zoneIdsConsidered: Array.from(tripsZone.ids),
        recordsScanned: records.length,
        tripsFound: out.length,
        totalSeats: out.reduce((s, t) => s + t.count, 0),
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
