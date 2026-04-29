// Pastoral analytics endpoint. POST a filter set, get back enriched +
// aggregated records. Allowlisted-only when ANALYTICS_ALLOWED_EMAILS is
// set; otherwise inherits the app-wide domain auth.

import { NextResponse, type NextRequest } from "next/server";

import { requireAnalyticsAccess } from "@/lib/analytics-auth";
import { OrahError } from "@/lib/orah";
import { queryPastoral } from "@/lib/pastoral";
import type { PastoralFilters } from "@/types/analytics";

export const dynamic = "force-dynamic";

function parseFilters(body: unknown): PastoralFilters | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.startDate !== "string" || typeof b.endDate !== "string") {
    return { error: "startDate and endDate (ISO strings) are required" };
  }
  const filters: PastoralFilters = {
    startDate: b.startDate,
    endDate: b.endDate,
  };
  if (Array.isArray(b.categories)) {
    filters.categories = b.categories.filter(
      (c): c is string => typeof c === "string",
    );
  }
  if (Array.isArray(b.houseIds)) {
    filters.houseIds = b.houseIds.filter(
      (h): h is number => typeof h === "number" && Number.isFinite(h),
    );
  }
  if (Array.isArray(b.yearLevels)) {
    filters.yearLevels = b.yearLevels.filter(
      (y): y is string => typeof y === "string",
    );
  }
  if (typeof b.watchlistOnly === "boolean") {
    filters.watchlistOnly = b.watchlistOnly;
  }
  if (typeof b.includeSensitive === "boolean") {
    filters.includeSensitive = b.includeSensitive;
  }
  if (typeof b.search === "string") filters.search = b.search;
  return filters;
}

export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => null);
  const parsed = parseFilters(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await queryPastoral(parsed);
    return NextResponse.json(result);
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
