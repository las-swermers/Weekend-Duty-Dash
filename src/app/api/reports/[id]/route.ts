import { auth } from "@/lib/auth";
import { idPattern, isReportsAdmin } from "@/lib/reports/config";
import { getRun, subscription } from "@/lib/reports/store";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  const hidden = () =>
    new Response("Report unavailable or access denied.", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (!email || !idPattern.test(params.id)) return hidden();
  const run = await getRun(params.id);
  if (!run) return hidden();
  if (!isReportsAdmin(email)) {
    const s = await subscription(run.subscriptionId);
    if (
      run.kind !== "weekly" ||
      !s?.recipients.includes(email) ||
      !run.deliveries.some((d) => d.email === email)
    )
      return hidden();
  }
  return new Response(run.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      "Referrer-Policy": "no-referrer",
    },
  });
}
