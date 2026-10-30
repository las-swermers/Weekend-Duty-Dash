import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/analytics-auth";
import { requireWarningsAccess } from "@/lib/warnings-auth";
import { reportsAdmin } from "@/lib/reports/auth";
import { analyticsRange } from "@/lib/analytics/range";
import { buildAnalytics } from "@/lib/analytics/data";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: Request) {
  if (!(await requireAnalyticsAccess()).ok)
    return NextResponse.json(
      { error: "Analytics access required." },
      { status: 403 },
    );
  const url = new URL(req.url);
  let range,
    dorm: number | null = null;
  try {
    range = analyticsRange(
      url.searchParams.get("start") ?? "",
      url.searchParams.get("end") ?? "",
    );
    const value = url.searchParams.get("dorm");
    if (value && (!/^\d+$/.test(value) || Number(value) <= 0))
      throw new Error("Invalid dorm.");
    dorm = value ? Number(value) : null;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid filters." },
      { status: 400 },
    );
  }
  try {
    const [admin, warnings] = await Promise.all([
      reportsAdmin(),
      requireWarningsAccess(),
    ]);
    return NextResponse.json(
      await buildAnalytics(
        range.start,
        range.end,
        dorm,
        Boolean(admin),
        warnings.ok,
        range.isLive,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Analytics sources unavailable. Check Orah and roster configuration, then retry.",
      },
      { status: 503 },
    );
  }
}
