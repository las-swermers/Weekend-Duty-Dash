// Activities calendar feed. Pulls events from a Google Calendar shared
// with the same service account used for the clipboard sheet sync.
// Window is configurable via ?days=<n> (default 3, capped at 31).

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import {
  isCalendarConfigured,
  listCalendarEvents,
} from "@/lib/google-calendar";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCalendarConfigured()) {
    return NextResponse.json({
      events: [],
      configured: false,
    });
  }

  const url = new URL(req.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const daysParam = Number(url.searchParams.get("days"));

  let startISO: string;
  let endISO: string;
  if (startParam && endParam) {
    startISO = startParam;
    endISO = endParam;
  } else {
    const days = Math.min(
      Math.max(Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 3, 1),
      31,
    );
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    startISO = start.toISOString();
    endISO = end.toISOString();
  }

  try {
    const events = await listCalendarEvents(startISO, endISO);
    return NextResponse.json({
      events,
      configured: true,
      windowStart: startISO,
      windowEnd: endISO,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        configured: true,
      },
      { status: 502 },
    );
  }
}
