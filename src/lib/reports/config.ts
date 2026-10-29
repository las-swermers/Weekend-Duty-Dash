import { TZDate } from "@date-fns/tz";
import { weekKey, weekRange } from "@/lib/dates";
import type { Subscription } from "./types";

export const REPORT_TIMEZONE = "Europe/Zurich";
export const MAX_SUBSCRIPTIONS = 30;
export const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
export function isReportsAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return (process.env.REPORTS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
export function parseRecipients(value: unknown): string[] {
  const items = typeof value === "string" ? value.split(/[\s,;]+/) : value;
  if (!Array.isArray(items) || items.some((e) => typeof e !== "string")) {
    throw new Error("Enter email addresses separated by commas or new lines.");
  }
  const emails = Array.from(
    new Set(items.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  );
  const domain = (process.env.ALLOWED_DOMAIN ?? "las.ch").toLowerCase();
  if (
    emails.length > 25 ||
    emails.some(
      (e) =>
        !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/.test(e) ||
        e.split("@")[1] !== domain,
    )
  ) {
    throw new Error(`Use up to 25 valid @${domain} email addresses.`);
  }
  return emails;
}
export function validateSubscription(
  value: unknown,
  houses: { id: number; name: string }[],
  email: string,
): Subscription {
  if (!value || typeof value !== "object")
    throw new Error("A report subscription is required.");
  const s = value as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id.length > 80 || !idPattern.test(s.id))
    throw new Error("Invalid subscription ID.");
  if (
    typeof s.name !== "string" ||
    !s.name.trim() ||
    s.name.length > 100 ||
    /[\r\n]/.test(s.name)
  )
    throw new Error("Enter a report name (up to 100 characters).");
  const dorm = houses.find((h) => h.id === s.dormId);
  if (!dorm) throw new Error("Choose a dorm from Orah.");
  for (const flag of ["warnings", "analytics", "expanded", "enabled"]) {
    if (typeof s[flag] !== "boolean")
      throw new Error(`Invalid ${flag} setting.`);
  }
  if (!s.warnings && !s.analytics)
    throw new Error("Choose warnings, analytics, or both.");
  if (
    !Number.isInteger(s.weekday) ||
    Number(s.weekday) < 0 ||
    Number(s.weekday) > 6
  )
    throw new Error("Choose a delivery day.");
  const recipients = parseRecipients(s.recipients);
  if (s.enabled && !recipients.length)
    throw new Error("Add at least one recipient before enabling delivery.");
  return {
    id: s.id,
    name: s.name.trim(),
    dormId: dorm.id,
    dormName: dorm.name,
    recipients,
    warnings: s.warnings as boolean,
    analytics: s.analytics as boolean,
    expanded: Boolean(s.analytics && s.expanded),
    enabled: s.enabled as boolean,
    weekday: Number(s.weekday),
    updatedAt: new Date().toISOString(),
    updatedBy: email,
  };
}
export function previousWeek(now = new Date()): string {
  return weekKey(weekRange(now, -1).start);
}
export function isCompleteWeek(key: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = new Date(`${key}T12:00:00Z`);
  return (
    Number.isFinite(d.getTime()) &&
    d.toISOString().slice(0, 10) === key &&
    weekKey(d) === key &&
    key < weekKey(now)
  );
}
export function isDue(s: Subscription, now = new Date()): boolean {
  return s.enabled && new TZDate(now, REPORT_TIMEZONE).getDay() === s.weekday;
}

export function safeReportCallback(value: string | undefined): string {
  return value &&
    (/^\/api\/reports\/[a-zA-Z0-9_-]{1,100}$/.test(value) ||
      value === "/admin/reports")
    ? value
    : "/";
}
