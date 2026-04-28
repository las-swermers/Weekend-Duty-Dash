import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isMockMode } from "@/lib/orah";
import { TRAVEL_REQUESTS } from "@/lib/mock";

export const revalidate = 60;

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isMockMode()) {
    return NextResponse.json({
      requests: TRAVEL_REQUESTS,
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  return NextResponse.json(
    {
      error:
        "Orah integration not implemented. Confirm leave-request endpoint shape in Phase 0.",
    },
    { status: 501 },
  );
}
