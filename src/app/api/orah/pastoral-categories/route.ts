// Discovery: aggregate every pastoral category in use over a configurable
// look-back window. Tells us what taxonomy LAS actually uses (Medical
// note, No Physical Activity, Discipline, Early Check-in, Clipboard,
// Suspended, Watchlist, etc.) so we can wire each to a dashboard
// section with confidence.

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { OrahError } from "@/lib/orah";
import { listPastoralTimeline } from "@/lib/orah-resources";

export const dynamic = "force-dynamic";

interface CategoryStats {
  id: number | null;
  name: string;
  count: number;
  watchlistCount: number;
  sensitiveCount: number;
  recentExamples: string[]; // top-3 description snippets
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.max(1, Math.min(180, Number(req.nextUrl.searchParams.get("days")) || 30));
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  start.setUTCHours(0, 0, 0, 0);

  try {
    const records = await listPastoralTimeline(start.toISOString(), undefined, {
      pageSize: 50,
      maxPages: 60,
    });

    const buckets = new Map<string, CategoryStats>();
    for (const r of records) {
      const key = r.pastoral_category?.name ?? "(no category)";
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          id: r.pastoral_category?.id ?? null,
          name: key,
          count: 0,
          watchlistCount: 0,
          sensitiveCount: 0,
          recentExamples: [],
        };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (r.watchlist) bucket.watchlistCount += 1;
      if (r.sensitive) bucket.sensitiveCount += 1;
      if (bucket.recentExamples.length < 3 && r.description) {
        bucket.recentExamples.push(
          r.description.length > 80
            ? `${r.description.slice(0, 80)}…`
            : r.description,
        );
      }
    }

    const sorted = Array.from(buckets.values()).sort(
      (a, b) => b.count - a.count,
    );

    return NextResponse.json({
      window: { start: start.toISOString(), days },
      totalRecords: records.length,
      uniqueCategories: sorted.length,
      categories: sorted,
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
