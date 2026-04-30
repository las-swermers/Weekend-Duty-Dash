// Resolution analytics for tick-off (clipboard) data. Aggregates ServedEntry
// records from KV across the supplied window and reports completion stats.
// Auth-gated by the same allowlist as /analytics.

import { NextResponse, type NextRequest } from "next/server";

import { getAllServedInWindow } from "@/lib/clipboard-store";
import { requireAnalyticsAccess } from "@/lib/analytics-auth";

export const dynamic = "force-dynamic";

interface BucketStat {
  label: string;
  count: number;
}

interface ResolutionResponse {
  windowStart: string;
  windowEnd: string;
  totalResolved: number;
  uniqueStaff: number;
  avgTimeToResolutionMs: number | null;
  byStaff: BucketStat[];
  byDorm: BucketStat[];
  byCategory: BucketStat[];
  byDay: { day: string; count: number }[];
}

function shortStaff(email: string | undefined): string {
  if (!email) return "unknown";
  return email.split("@")[0];
}

export async function GET(req: NextRequest) {
  const access = await requireAnalyticsAccess();
  if (!access.ok) {
    const status = access.reason === "unauthenticated" ? 401 : 403;
    return NextResponse.json({ error: access.reason }, { status });
  }

  const start = req.nextUrl.searchParams.get("start") ?? "";
  const end = req.nextUrl.searchParams.get("end") ?? "";
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) {
    return NextResponse.json(
      { error: "start and end (ISO) required" },
      { status: 400 },
    );
  }

  const entries = await getAllServedInWindow(start, end);

  const staffCounts = new Map<string, number>();
  const dormCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  let timeSum = 0;
  let timeSamples = 0;

  for (const e of entries) {
    const staff = shortStaff(e.servedBy);
    staffCounts.set(staff, (staffCounts.get(staff) ?? 0) + 1);

    const dorm = e.dorm ?? "—";
    dormCounts.set(dorm, (dormCounts.get(dorm) ?? 0) + 1);

    const category = e.category ?? "—";
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);

    if (e.servedAt) {
      const day = e.servedAt.slice(0, 10);
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }

    if (e.recordDate && e.servedAt) {
      const recMs = Date.parse(e.recordDate);
      const servedMs = Date.parse(e.servedAt);
      if (Number.isFinite(recMs) && Number.isFinite(servedMs) && servedMs >= recMs) {
        timeSum += servedMs - recMs;
        timeSamples += 1;
      }
    }
  }

  const toSorted = (m: Map<string, number>): BucketStat[] =>
    Array.from(m.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const byDay = Array.from(dayCounts.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  const body: ResolutionResponse = {
    windowStart: start,
    windowEnd: end,
    totalResolved: entries.length,
    uniqueStaff: staffCounts.size,
    avgTimeToResolutionMs: timeSamples > 0 ? Math.round(timeSum / timeSamples) : null,
    byStaff: toSorted(staffCounts),
    byDorm: toSorted(dormCounts),
    byCategory: toSorted(categoryCounts),
    byDay,
  };

  return NextResponse.json(body);
}
