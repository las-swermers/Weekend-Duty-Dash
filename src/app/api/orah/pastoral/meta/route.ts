import { NextResponse, type NextRequest } from "next/server";

import { requireAnalyticsAccess } from "@/lib/analytics-auth";
import { OrahError } from "@/lib/orah";
import { getPastoralMeta } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await requireAnalyticsAccess();
  if (!access.ok) {
    return NextResponse.json(
      {
        error:
          access.reason === "not-allowlisted"
            ? "This account is not on the analytics allowlist."
            : "Unauthorized",
      },
      { status: 403 },
    );
  }

  const params = req.nextUrl.searchParams;
  const start = params.get("start");
  const end = params.get("end");

  const now = new Date();
  const defaultEnd = end ?? now.toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const defaultStart = start ?? thirtyDaysAgo.toISOString();

  try {
    const meta = await getPastoralMeta({
      start: defaultStart,
      end: defaultEnd,
    });
    return NextResponse.json(meta);
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
