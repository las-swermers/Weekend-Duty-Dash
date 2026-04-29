import Link from "next/link";

import { AnalyticsClient } from "@/components/analytics/analytics-client";
import { requireAnalyticsAccess } from "@/lib/analytics-auth";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Analytics · LAS Duty Dashboard",
};

export default async function AnalyticsPage() {
  const access = await requireAnalyticsAccess();

  if (!access.ok) {
    return (
      <div className="app" data-density="balanced">
        <header className="masthead">
          <div>
            <div className="masthead__crest">
              Leysin American School · Pastoral Analytics
            </div>
            <h1 className="masthead__title">
              Pastoral <em>Analytics</em>
            </h1>
            <div className="masthead__sub">
              <span>Restricted view</span>
            </div>
          </div>
        </header>

        <div className="section">
          <div className="section__head">
            <div className="section__num">№ 401</div>
            <h2 className="section__title">
              Access <em>denied</em>
            </h2>
            <div className="section__sub">
              {access.reason === "not-allowlisted"
                ? `${access.email ?? "This account"} is not on the pastoral analytics allowlist. Ask the AOC team to add you to ANALYTICS_ALLOWED_EMAILS.`
                : "Sign in to continue."}
            </div>
          </div>
          <Link href="/" className="btn btn--ghost btn--sm">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return (
    <AnalyticsClient
      defaultStart={start.toISOString()}
      defaultEnd=""
      viewerEmail={access.email ?? ""}
    />
  );
}
