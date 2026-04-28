// Probes leave/pass-related endpoints to figure out how to surface
// active passes (HC residents, weekend travel, trips) at LAS, given
// that location records do NOT reflect pass status.
//
// We confirmed earlier:
// - get-current location records map ~all students to "Signed In" /
//   "BEC" / a few off-grounds zones — passes don't move students.
// - The docs only list leave/{get-single,create,update,delete} — no
//   `list`. But undocumented endpoints sometimes exist.
//
// This route POSTs to a battery of candidate paths and reports
// status + a small body sample for each, so we can pick the right
// data source for the dashboard's pass-driven sections.

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
    date_range: {
      start_date: "2026-04-01T00:00:00.000Z",
    },
    page_size: 5,
    page_index: 0,
  },
};

const PROBES: Array<{ path: string; body: unknown }> = [
  // Confirmed paths from the docs — useful for IDs.
  { path: "/open-api/leave-type/list", body: {} },
  { path: "/open-api/pastoral/timeline", body: RECENT_RANGE_BODY },
  { path: "/open-api/roll/timeline", body: { query: { status: "All", date_range: { start_date: "2026-04-01T00:00:00.000Z" }, page_size: 5, page_index: 0 } } },

  // Speculative leave-list candidates (undocumented).
  { path: "/open-api/leave/list", body: {} },
  { path: "/open-api/leave/list", body: { query: { status: "Active" } } },
  { path: "/open-api/leave/timeline", body: RECENT_RANGE_BODY },
  { path: "/open-api/leave/list-active", body: {} },
  { path: "/open-api/leave/get-active", body: {} },
  { path: "/open-api/leave/by-status", body: { query: { status: "Active" } } },
  { path: "/open-api/leave/search", body: {} },
  { path: "/open-api/leave/active", body: {} },

  // Pastoral category list — would help wire up no-PA later.
  { path: "/open-api/pastoral-category/list", body: {} },
  { path: "/open-api/pastoral/category/list", body: {} },
];

function summarise(value: unknown): unknown {
  if (value && typeof value === "object" && "data" in value) {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return {
        kind: "list",
        count: data.length,
        first: data[0] ?? null,
      };
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
