import { createHash, randomUUID } from "node:crypto";
import { Resend } from "resend";
import { buildReport } from "./data";
import { parseRecipients } from "./config";
import { renderReport, renderText } from "./render";
import { getRun, saveRun, subscription, withLock } from "./store";
import type { ReportRun, Subscription } from "./types";

export function emailReady(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.EMAIL_FROM &&
      process.env.NEXT_PUBLIC_SITE_URL,
  );
}
export function sendingEnabled(): boolean {
  return (
    process.env.REPORTS_EMAIL_ENABLED === "1" &&
    (process.env.VERCEL_ENV === "production" ||
      (!process.env.VERCEL_ENV && process.env.NODE_ENV !== "production"))
  );
}
function siteUrl(): string {
  const u = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if (
    u.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && u.hostname === "localhost")
  )
    throw new Error("Configure a secure canonical site URL.");
  return u.origin;
}
export function reportUrl(id: string): string {
  return `${siteUrl()}/api/reports/${id}`;
}
export async function createRun(
  s: Subscription,
  week: string,
  kind: ReportRun["kind"],
  email?: string,
): Promise<ReportRun> {
  const id = kind === "weekly" ? `weekly-${s.id}-${week}` : randomUUID();
  const data = await buildReport(s, week);
  const url = reportUrl(id);
  const recipients = parseRecipients(
    kind === "weekly" ? s.recipients : [email],
  );
  if (!recipients.length) throw new Error("No recipients configured.");
  const run: ReportRun = {
    id,
    subscriptionId: s.id,
    subscriptionVersion: s.updatedAt,
    name: s.name,
    week,
    kind,
    createdAt: data.generatedAt,
    html: renderReport(data, url),
    text: renderText(data, url),
    from: process.env.EMAIL_FROM ?? "",
    subject: `${kind === "test" ? "[TEST] " : ""}${data.dorm} — ${s.name} — ${data.label}`,
    deliveries: recipients.map((email) => ({ email })),
  };
  // Freeze the exact email alongside the printable snapshot for idempotent retries.
  const { kv } = await import("@vercel/kv");
  await kv.set(`reports:v1:email:${id}`, renderReport(data, url, true), {
    ex: 90 * 86400,
  });
  await saveRun(run);
  return run;
}
export function retryAllowed(
  firstAttemptAt: string | undefined,
  now = Date.now(),
): boolean {
  // Stop before the provider's 24-hour deduplication window expires. An
  // uncertain previous acceptance needs operator review, never blind resend.
  return !firstAttemptAt || now - Date.parse(firstAttemptAt) < 23 * 3600_000;
}
export async function deliverRun(run: ReportRun): Promise<ReportRun> {
  if (!sendingEnabled() || !emailReady())
    throw new Error("Email delivery is not enabled or configured.");
  const { kv } = await import("@vercel/kv");
  const html = await kv.get<string>(`reports:v1:email:${run.id}`);
  if (!html)
    throw new Error("Frozen email snapshot is unavailable; no email sent.");
  const resend = new Resend(process.env.RESEND_API_KEY);
  for (const delivery of run.deliveries) {
    if (delivery.providerId) continue;
    // Re-read before each recipient so removing/pausing a subscription takes
    // effect during retries as well as future scheduled runs.
    const current = await subscription(run.subscriptionId);
    if (
      !current ||
      (run.kind === "weekly" &&
        (!current.enabled ||
          current.updatedAt !== run.subscriptionVersion ||
          !current.recipients.includes(delivery.email)))
    ) {
      delivery.error =
        "Cancelled: subscription changed, paused, or recipient removed.";
      await saveRun(run);
      continue;
    }
    if (!retryAllowed(delivery.firstAttemptAt)) {
      delivery.error =
        "Needs review: previous send outcome uncertain and retry window expired.";
      await saveRun(run);
      continue;
    }
    delivery.firstAttemptAt ??= new Date().toISOString();
    delete delivery.error;
    await saveRun(run); // Persist intent BEFORE the external side effect.
    try {
      const result = await resend.emails.send(
        {
          from: run.from,
          to: delivery.email,
          subject: run.subject,
          html,
          text: run.text,
        },
        {
          idempotencyKey: `dorm-report/${run.id}/${createHash("sha256").update(delivery.email).digest("hex").slice(0, 24)}`,
        },
      );
      if (result.error || !result.data?.id)
        throw new Error("Email provider did not confirm acceptance.");
      delivery.providerId = result.data.id;
    } catch {
      delivery.error =
        "Provider acceptance unconfirmed. Retry within 23 hours or review in Resend.";
    }
    await saveRun(run);
    // Resend's default rate limit is low; one recipient at a time. Separate
    // requests ensure dorm recipient addresses are not disclosed to others.
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return run;
}
export async function sendWeekly(
  s: Subscription,
  week: string,
): Promise<ReportRun> {
  return withLock(`weekly-${s.id}-${week}`, async () => {
    const current = await subscription(s.id);
    if (!current?.enabled) throw new Error("Subscription is paused.");
    const run =
      (await getRun(`weekly-${s.id}-${week}`)) ??
      (await createRun(current, week, "weekly"));
    return deliverRun(run);
  });
}
