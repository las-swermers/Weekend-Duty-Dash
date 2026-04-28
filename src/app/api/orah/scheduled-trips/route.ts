import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isMockMode } from "@/lib/orah";
import { SCHEDULED_TRIPS } from "@/lib/mock";

export const revalidate = 60;

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isMockMode()) {
    return NextResponse.json({
      trips: SCHEDULED_TRIPS,
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  return NextResponse.json(
    {
      error:
        "Orah integration not implemented. Phase 0 needs to determine whether trips live in an Activities module or are filtered leave requests.",
    },
    { status: 501 },
  );
}
