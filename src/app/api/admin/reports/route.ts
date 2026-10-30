import { NextResponse } from "next/server";
import { reportsAdmin, sameOrigin } from "@/lib/reports/auth";
import {
  idPattern,
  MAX_SUBSCRIPTIONS,
  previousWeek,
  validateSubscription,
} from "@/lib/reports/config";
import { listHouses } from "@/lib/orah-resources";
import {
  deleteSubscription,
  history,
  saveSubscription,
  storageReady,
  subscriptions,
  withLock,
} from "@/lib/reports/store";
import { emailReady, sendingEnabled } from "@/lib/reports/send";
import { isWarningsSheetConfigured } from "@/lib/warnings-sheet";
export const dynamic = "force-dynamic";
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });
export async function GET() {
  if (!(await reportsAdmin())) return fail("Admin access required.", 403);
  try {
    const houses = await listHouses();
    return NextResponse.json(
      {
        subscriptions: storageReady() ? await subscriptions() : [],
        history: storageReady() ? await history() : [],
        houses: houses.map((h) => ({ id: h.id, name: h.name })),
        previousWeek: previousWeek(),
        readiness: {
          storage: storageReady(),
          email: emailReady(),
          enabled: sendingEnabled(),
          warnings: isWarningsSheetConfigured(),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return fail(
      "Could not load report settings or Orah dorms. Check service configuration and try again.",
      503,
    );
  }
}
export async function PUT(req: Request) {
  const email = await reportsAdmin();
  if (!email || !sameOrigin(req)) return fail("Admin access required.", 403);
  try {
    const s = validateSubscription(await req.json(), await listHouses(), email);
    await withLock("settings", async () => {
      const all = await subscriptions();
      if (all.length >= MAX_SUBSCRIPTIONS && !all.some((v) => v.id === s.id))
        throw new Error(`Maximum ${MAX_SUBSCRIPTIONS} subscriptions.`);
      if (s.enabled && (!emailReady() || !sendingEnabled()))
        throw new Error(
          "Configure and enable email delivery before enabling a subscription.",
        );
      if (s.enabled && s.warnings && !isWarningsSheetConfigured())
        throw new Error("Configure the warnings conversation sheet first.");
      await saveSubscription(s);
    });
    return NextResponse.json({ subscription: s });
  } catch (err) {
    return fail(
      err instanceof Error ? err.message : "Could not save subscription.",
    );
  }
}
export async function DELETE(req: Request) {
  if (!(await reportsAdmin()) || !sameOrigin(req))
    return fail("Admin access required.", 403);
  try {
    const { id } = await req.json();
    if (typeof id !== "string" || !idPattern.test(id))
      return fail("Invalid subscription.");
    await withLock("settings", () => deleteSubscription(id));
    return NextResponse.json({ ok: true });
  } catch {
    return fail("Could not delete subscription.", 503);
  }
}
