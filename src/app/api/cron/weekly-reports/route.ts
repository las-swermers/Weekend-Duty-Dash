import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isDue, previousWeek } from "@/lib/reports/config";
import { emailReady, sendingEnabled, sendWeekly } from "@/lib/reports/send";
import { subscriptions, withLock, recordFailure } from "@/lib/reports/store";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sendingEnabled())
    return NextResponse.json({ skipped: "Email delivery disabled" });
  if (!emailReady())
    return NextResponse.json(
      { error: "Email is not configured" },
      { status: 503 },
    );
  try {
    return await withLock("cron", async () => {
      const now = new Date();
      const results = [];
      for (const s of (await subscriptions()).filter((s) => isDue(s, now))) {
        if (Date.now() - now.getTime() > 240_000) {
          await recordFailure(
            s,
            previousWeek(now),
            "Execution budget reached. Use Retry to generate this report.",
          );
          results.push({
            id: s.id,
            error: "Execution budget reached; report not sent.",
          });
          continue;
        }
        try {
          const run = await sendWeekly(s, previousWeek(now));
          results.push({
            id: s.id,
            accepted: run.deliveries.filter((d) => d.providerId).length,
            total: run.deliveries.length,
            error: run.deliveries.some((d) => d.error)
              ? "Some deliveries need review"
              : undefined,
          });
        } catch {
          await recordFailure(
            s,
            previousWeek(now),
            "Report generation or delivery failed. Check Orah, conversation-sheet and storage availability, then retry.",
          );
          results.push({
            id: s.id,
            error:
              "Report generation or delivery failed; no successful send assumed.",
          });
        }
      }
      return NextResponse.json(
        { results },
        { status: results.some((r) => r.error) ? 503 : 200 },
      );
    });
  } catch {
    return NextResponse.json(
      { error: "Report scheduler unavailable or already running." },
      { status: 503 },
    );
  }
}
