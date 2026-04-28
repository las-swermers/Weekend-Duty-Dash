import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isMockMode } from "@/lib/orah";
import { NO_PA_STUDENTS } from "@/lib/mock";

export const revalidate = 60;

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isMockMode()) {
    return NextResponse.json({
      students: NO_PA_STUDENTS,
      pulledAt: new Date().toISOString(),
      source: "mock",
    });
  }

  return NextResponse.json(
    {
      error:
        "Orah integration not implemented. Complete Phase 0 discovery to learn how 'no PA' is encoded at LAS.",
    },
    { status: 501 },
  );
}
