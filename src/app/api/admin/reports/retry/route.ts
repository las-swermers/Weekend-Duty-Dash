import { NextResponse } from "next/server";
import { reportsAdmin, sameOrigin } from "@/lib/reports/auth";
import { idPattern } from "@/lib/reports/config";
import {
  getRun,
  getSummary,
  subscription,
  withLock,
} from "@/lib/reports/store";
import { deliverRun, sendWeekly } from "@/lib/reports/send";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(req: Request) {
  if (!(await reportsAdmin()) || !sameOrigin(req))
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 },
    );
  try {
    const { id } = await req.json();
    if (typeof id !== "string" || !idPattern.test(id))
      throw new Error("Invalid report.");
    return await withLock(
      id.startsWith("weekly-") ? id : `retry-${id}`,
      async () => {
        let run = await getRun(id);
        if (!run) {
          const summary = await getSummary(id);
          const s =
            summary && !summary.snapshotAvailable
              ? await subscription(summary.subscriptionId)
              : null;
          if (!s || !summary) throw new Error("No sendable report found.");
          run = await sendWeekly(s, summary.week);
          return NextResponse.json({
            ok: true,
            error: run.deliveries.find((d) => d.error)?.error,
          });
        }
        if (run.kind === "preview")
          throw new Error("No sendable report found.");
        await deliverRun(run);
        return NextResponse.json({
          ok: true,
          error: run.deliveries.find((d) => d.error)?.error,
        });
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Retry failed." },
      { status: 503 },
    );
  }
}
