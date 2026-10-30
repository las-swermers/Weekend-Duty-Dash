import { NextResponse } from "next/server";
import { reportsAdmin, sameOrigin } from "@/lib/reports/auth";
import {
  saveTargets,
  syncWatchlist,
  validateTargets,
} from "@/lib/analytics/tracking";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(req: Request) {
  if (!(await reportsAdmin()) || !sameOrigin(req))
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 },
    );
  try {
    const state = await syncWatchlist();
    return NextResponse.json({ observedAt: state.observedAt });
  } catch {
    return NextResponse.json(
      {
        error:
          "Collection failed. Check production environment, Orah and storage configuration; existing observations were preserved.",
      },
      { status: 503 },
    );
  }
}
export async function PUT(req: Request) {
  const admin = await reportsAdmin();
  if (!admin || !sameOrigin(req))
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 },
    );
  try {
    const targets = validateTargets((await req.json()).targets);
    await saveTargets(targets, admin);
    return NextResponse.json({ targets });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save targets." },
      { status: 400 },
    );
  }
}
