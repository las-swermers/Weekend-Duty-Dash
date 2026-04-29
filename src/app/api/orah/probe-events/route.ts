// Probes event/activity endpoints. The Orah Admin Console has an
// "Event Coordinator" section under /staff/coordinate/event-coordinator/all
// where activities like the "Côte d'Azur Overnight Trip" live with
// opt-in/RSVP tracking, but the public docs list NO endpoints under
// event/, activity/, or coordinate/. This route POSTs to a battery of
// candidate paths to confirm whether the API exposes events at all.

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { OrahError, orahCall } from "@/lib/orah";

export const dynamic = "force-dynamic";

interface ProbeOutcome {
  path: string;
  body: unknown;
  ok: boolean;
  status?: number;
  ms: number;
  sample?: unknown;
  error?: string;
  bodyPreview?: string;
}

const RECENT_RANGE_BODY = {
  query: {
    date_range: { start_date: "2026-04-01T00:00:00.000Z" },
    page_size: 5,
    page_index: 0,
  },
};

const PROBES: Array<{ path: string; body: unknown }> = [
  // Direct candidates.
  { path: "/open-api/event/list", body: {} },
  { path: "/open-api/event/list", body: RECENT_RANGE_BODY },
  { path: "/open-api/event/timeline", body: RECENT_RANGE_BODY },
  { path: "/open-api/events/list", body: {} },
  { path: "/open-api/event-coordinator/list", body: {} },
  { path: "/open-api/coordinate/list", body: {} },
  { path: "/open-api/coordinate/event/list", body: {} },

  // Activities terminology.
  { path: "/open-api/activity/list", body: {} },
  { path: "/open-api/activity/list", body: RECENT_RANGE_BODY },
  { path: "/open-api/activity/timeline", body: RECENT_RANGE_BODY },
  { path: "/open-api/activities/list", body: {} },

  // Trip terminology.
  { path: "/open-api/trip/list", body: {} },
  { path: "/open-api/trips/list", body: {} },

  // Submission / opt-in tracking.
  { path: "/open-api/event-submission/list", body: {} },
  { path: "/open-api/submission/list", body: RECENT_RANGE_BODY },

  // Activity Feed / Posts — Orah staff UI has /staff/activity-feed where
  // duty staff write nightly "Duty Notes" posts. The public docs don't
  // list a posts endpoint; these are the most likely RPC names.
  { path: "/open-api/post/list", body: {} },
  { path: "/open-api/post/list", body: RECENT_RANGE_BODY },
  { path: "/open-api/post/timeline", body: RECENT_RANGE_BODY },
  { path: "/open-api/posts/list", body: {} },
  { path: "/open-api/feed/list", body: {} },
  { path: "/open-api/feed/timeline", body: RECENT_RANGE_BODY },
  { path: "/open-api/activity-feed/list", body: {} },
  { path: "/open-api/activity-feed/timeline", body: RECENT_RANGE_BODY },
  { path: "/open-api/announcement/list", body: {} },
  { path: "/open-api/announcement/timeline", body: RECENT_RANGE_BODY },
  { path: "/open-api/news/list", body: {} },
  { path: "/open-api/communication/list", body: {} },
  { path: "/open-api/communication/timeline", body: RECENT_RANGE_BODY },
  { path: "/open-api/note/list", body: {} },
  { path: "/open-api/note/timeline", body: RECENT_RANGE_BODY },
  { path: "/open-api/notes/list", body: {} },
  { path: "/open-api/template/list", body: {} },

  // Roll timeline filtered to trip-style types — proven to work, just
  // surfacing here for comparison.
  { path: "/open-api/roll/timeline", body: { query: { status: "All", date_range: { start_date: "2026-04-01T00:00:00.000Z" }, page_size: 5, page_index: 0 } } },
];

function summarise(value: unknown): unknown {
  if (value && typeof value === "object" && "data" in value) {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return { kind: "list", count: data.length, first: data[0] ?? null };
    }
    return { kind: "single", data };
  }
  return value;
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await Promise.all(
    PROBES.map(async (p): Promise<ProbeOutcome> => {
      const start = Date.now();
      try {
        const data = await orahCall(p.path, p.body);
        return {
          path: p.path,
          body: p.body,
          ok: true,
          status: 200,
          ms: Date.now() - start,
          sample: summarise(data),
        };
      } catch (err) {
        if (err instanceof OrahError) {
          return {
            path: p.path,
            body: p.body,
            ok: false,
            status: err.status,
            ms: Date.now() - start,
            error: err.message,
            bodyPreview: err.bodyPreview,
          };
        }
        return {
          path: p.path,
          body: p.body,
          ok: false,
          ms: Date.now() - start,
          error: err instanceof Error ? err.message : "unknown",
        };
      }
    }),
  );

  const successes = results.filter((r) => r.ok).map((r) => r.path);

  return NextResponse.json({
    probedAt: new Date().toISOString(),
    successes,
    results,
  });
}
