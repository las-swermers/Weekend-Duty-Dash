// Weekly Warnings review feed.
//
// GET ?week=<YYYY-MM-DD Monday>|?offset=<weeks back, negative>&dorm=<name>
//   Students who picked up an Orah warning in that week, with their term
//   history, escalation level and this week's conversation row.

import { NextResponse, type NextRequest } from "next/server";

import { OrahError } from "@/lib/orah";
import { getWarningsForWeek } from "@/lib/warnings";
import { requireWarningsAccess } from "@/lib/warnings-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await requireWarningsAccess();
  if (!access.ok) {
    return NextResponse.json(
      {
        error:
          access.reason === "not-allowlisted"
            ? `${access.email ?? "This account"} is not on the warnings allowlist.`
            : "Unauthorized",
      },
      { status: access.reason === "not-allowlisted" ? 403 : 401 },
    );
  }

  const params = req.nextUrl.searchParams;
  const rawOffset = params.get("offset");
  const offset = rawOffset === null ? null : Number(rawOffset);

  try {
    const data = await getWarningsForWeek({
      weekKey: params.get("week"),
      offset: offset !== null && Number.isFinite(offset) ? offset : null,
      dorm: params.get("dorm"),
    });
    return NextResponse.json(data);
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
