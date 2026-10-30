import { NextResponse } from "next/server";
import { reportsAdmin, sameOrigin } from "./auth";
import { idPattern, isCompleteWeek, previousWeek } from "./config";
import { createRun, deliverRun, emailReady, sendingEnabled } from "./send";
import { subscription, withLock } from "./store";
export async function reportAction(req: Request, kind: "preview" | "test") {
  const email = await reportsAdmin();
  if (!email || !sameOrigin(req))
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 },
    );
  try {
    const { id, week = previousWeek() } = await req.json();
    if (
      typeof id !== "string" ||
      !idPattern.test(id) ||
      typeof week !== "string" ||
      !isCompleteWeek(week)
    )
      throw new Error(
        "Choose a saved report and a completed week (Monday date).",
      );
    if (kind === "test" && (!emailReady() || !sendingEnabled()))
      throw new Error("Email delivery is not enabled or configured.");
    const s = await subscription(id);
    if (!s)
      throw new Error("Save this subscription before generating a report.");
    return await withLock(`action-${id}`, async () => {
      const run = await createRun(s, week, kind, email);
      if (kind === "test") await deliverRun(run);
      return NextResponse.json({
        id: run.id,
        url: `/api/reports/${run.id}`,
        accepted: run.deliveries.filter((d) => d.providerId).length,
        error: run.deliveries.find((d) => d.error)?.error,
      });
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not generate report.",
      },
      { status: 503 },
    );
  }
}
