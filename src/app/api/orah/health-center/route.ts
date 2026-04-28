import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isMockMode } from "@/lib/orah";
import { HC_STUDENTS } from "@/lib/mock";

export const revalidate = 60;

// Phase 2: replace the mock fall-through with a real Orah call.
// See WEEKEND_DASHBOARD_SPEC.md §5.3 and docs/orah-discovery.md.
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isMockMode()) {
    return NextResponse.json({
      students: HC_STUDENTS,
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  return NextResponse.json(
    {
      error:
        "Orah integration not implemented. Complete Phase 0 discovery and wire up src/lib/orah.ts.",
    },
    { status: 501 },
  );
}
