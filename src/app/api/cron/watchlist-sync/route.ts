import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncWatchlist } from "@/lib/analytics/tracking";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const state = await syncWatchlist();
    return NextResponse.json(
      { observedAt: state.observedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Watchlist collection unavailable; last successful observation preserved.",
      },
      { status: 503 },
    );
  }
}
