// Optional per-feature allowlist for the Warnings review. The rest of /live
// is domain-gated only; warnings carry written conversation notes, so a dorm
// can narrow access later by setting WARNINGS_ALLOWED_EMAILS without a code
// change. Unset = same domain-only auth as the rest of the dashboard.
//
// Same shape as src/lib/analytics-auth.ts.

import { auth } from "@/lib/auth";

export interface WarningsAuth {
  ok: boolean;
  email: string | null;
  reason?: "unauthenticated" | "not-allowlisted";
}

export async function requireWarningsAccess(): Promise<WarningsAuth> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return { ok: false, email: null, reason: "unauthenticated" };

  const raw = process.env.WARNINGS_ALLOWED_EMAILS;
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
