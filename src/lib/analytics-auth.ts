// Optional per-page allowlist for /analytics. When ANALYTICS_ALLOWED_EMAILS
// is set (comma-separated), only those emails can read pastoral data
// even though the rest of the app is gated by domain only. When the
// env var is unset, the analytics page falls back to the same
// domain-only auth as the duty dashboard.

import { auth } from "@/lib/auth";

export interface AnalyticsAuth {
  ok: boolean;
  email: string | null;
  reason?: "unauthenticated" | "not-allowlisted";
}

export async function requireAnalyticsAccess(): Promise<AnalyticsAuth> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return { ok: false, email: null, reason: "unauthenticated" };

  const raw = process.env.ANALYTICS_ALLOWED_EMAILS;
  if (!raw || !raw.trim()) return { ok: true, email };

  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!allowed.has(email.toLowerCase())) {
    return { ok: false, email, reason: "not-allowlisted" };
  }
  return { ok: true, email };
}
