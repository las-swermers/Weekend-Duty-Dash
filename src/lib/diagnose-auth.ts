// Admin-only allowlist for /api/orah/diagnose. The endpoint exposes raw
// upstream Orah probe results, which is useful in development but a
// reconnaissance vector in production. In production we require the
// viewer's email to be in DIAGNOSE_ALLOWED_EMAILS; otherwise we return
// 404 (invisible, not 403) so the route's existence is hidden.

const RAW = process.env.DIAGNOSE_ALLOWED_EMAILS ?? "";
const ALLOWED = new Set(
  RAW.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function isDiagnoseAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  if (ALLOWED.size === 0) return process.env.NODE_ENV !== "production";
  return ALLOWED.has(email.toLowerCase());
}
