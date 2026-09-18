// Push one week's warnings review into a dated tab of the dorm's Google
// Sheet. Re-running for the same week refreshes that tab rather than
// duplicating it.
//
// POST { week, dorm? }

import { NextResponse, type NextRequest } from "next/server";

import { isWeekKey } from "@/lib/dates";
import { OrahError } from "@/lib/orah";
import { getWarningsForWeek, reportRows } from "@/lib/warnings";
import { requireWarningsAccess } from "@/lib/warnings-auth";
import {
  WarningsSheetError,
  isWarningsSheetConfigured,
  pushWeeklyReportTab,
} from "@/lib/warnings-sheet";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const access = await requireWarningsAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isWarningsSheetConfigured()) {
    return NextResponse.json(
      {
        error:
          "No warnings sheet configured. Set WARNINGS_SHEET_ID and the Google service-account env vars.",
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    week?: string;
    dorm?: string;
  };
  if (!isWeekKey(body.week)) {
    return NextResponse.json(
      { error: "week must be a YYYY-MM-DD Monday" },
      { status: 400 },
    );
  }

  try {
    const data = await getWarningsForWeek({
      weekKey: body.week,
      dorm: body.dorm,
    });
    const result = await pushWeeklyReportTab(
      body.week,
      body.dorm,
      reportRows(data, body.dorm),
    );
    return NextResponse.json({
      ok: true,
      students: data.students.length,
      ...result,
    });
  } catch (err) {
    if (err instanceof WarningsSheetError) {
      return NextResponse.json(
        { error: err.message, bodyPreview: err.bodyPreview },
        { status: err.status },
      );
    }
    if (err instanceof OrahError) {
      return NextResponse.json(
        { error: err.message, bodyPreview: err.bodyPreview },
        { status: err.status },
      );
    }
    throw err;
  }
}
