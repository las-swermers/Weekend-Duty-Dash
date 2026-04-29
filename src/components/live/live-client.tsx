"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import { Icon, LASCrest } from "@/components/dashboard/icon";
import { EmptyState, SectionShell } from "@/components/dashboard/sections";
import { Toast } from "@/components/dashboard/toast";
import { signOutAction } from "@/lib/auth-actions";

interface Props {
  userName: string | null;
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
};

interface HCStudent {
  id: number;
  name: string;
  initials: string;
  dorm: string;
  reason: string;
  since: string;
  status: "in" | "overnight";
  location: string;
}

interface OffCampusStudent {
  id: number;
  name: string;
  initials: string;
  dorm: string;
  location: string;
  state: "off_grounds" | "home";
  since: string;
}

interface OffCampusResponse {
  students: OffCampusStudent[];
  counts: { offGrounds: number; home: number; total: number };
}

interface PastoralAlert {
  id: number;
  date: string;
  studentName: string;
  studentInitials: string;
  dorm: string;
  category: string;
  description: string;
  watchlist: boolean;
  sensitive: boolean;
  createdBy: string;
}

interface DormNote {
  id: number;
  date: string;
  studentName: string;
  studentInitials: string;
  dorm: string;
  description: string;
  createdBy: string;
}

interface LocationBucket {
  locationId: number;
  locationName: string;
  count: number;
  sampleStudents: string[];
}

const REFRESH_MS = 30_000;

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function LiveClient({ userName }: Props) {
  const locations = useSWR<{
    totalRecords: number;
    uniqueLocations: number;
    buckets: LocationBucket[];
    pulledAt: string;
  }>("/api/orah/current-locations", fetcher, {
    refreshInterval: REFRESH_MS,
  });
  const hc = useSWR<{ students: HCStudent[] }>(
    "/api/orah/health-center-live",
    fetcher,
    { refreshInterval: REFRESH_MS },
  );
  const offCampus = useSWR<OffCampusResponse>(
    "/api/orah/off-campus",
    fetcher,
    { refreshInterval: REFRESH_MS },
  );
  const alerts = useSWR<{ alerts: PastoralAlert[] }>(
    "/api/orah/pastoral-alerts",
    fetcher,
    { refreshInterval: REFRESH_MS },
  );
  const dormNotes = useSWR<{
    notes: DormNote[];
    configured: boolean;
    categoryName?: string;
  }>("/api/orah/dorm-notes", fetcher, { refreshInterval: REFRESH_MS });

  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState<string>(() => formatTime(new Date().toISOString()));

  useEffect(() => {
    const id = setInterval(
      () => setNow(formatTime(new Date().toISOString())),
      30_000,
    );
    return () => clearInterval(id);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      locations.mutate(),
      hc.mutate(),
      offCampus.mutate(),
      alerts.mutate(),
      dormNotes.mutate(),
    ]);
    setRefreshing(false);
    setToast("Live data refreshed");
    window.setTimeout(() => setToast(null), 2000);
  }, [locations, hc, offCampus, alerts, dormNotes]);

  const totalOnRecord = locations.data?.totalRecords ?? 0;
  const offCampusTotal = offCampus.data?.counts.total ?? 0;
  const homeTotal = offCampus.data?.counts.home ?? 0;
  const offGroundsTotal = offCampus.data?.counts.offGrounds ?? 0;
  const onCampusTotal = Math.max(0, totalOnRecord - offCampusTotal);
  const hcCount = hc.data?.students.length ?? 0;

  return (
    <div className="app" data-density="balanced">
      <header className="masthead">
        <div>
          <div className="masthead__crest">
            <LASCrest size={16} />
            Leysin American School · Live
          </div>
          <h1 className="masthead__title">
            Live <em>Duty</em> Dashboard
          </h1>
          <div className="masthead__sub">
            <span className="masthead__date">AS OF {now}</span>
            <span className="dot" />
            <span className="masthead__updated">refresh every 30s</span>
          </div>
        </div>
        <div className="masthead__actions">
          {userName ? (
            <span className="masthead__welcome">Welcome {userName}</span>
          ) : null}
          <Link href="/" className="btn btn--ghost btn--sm">
            <Icon name="folder" size={14} />
            Weekend Duty
          </Link>
          <Link href="/analytics" className="btn btn--ghost btn--sm">
            <Icon name="folder" size={14} />
            Analytics
          </Link>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handleRefresh}
            title="Refresh"
          >
            <Icon
              name="refresh"
              size={14}
              className={refreshing ? "refresh-spinning" : undefined}
            />
            Refresh
          </button>
          <form action={signOutAction}>
            <button type="submit" className="btn btn--ghost btn--sm">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="stat-grid">
        <Stat label="Students on record" value={totalOnRecord} />
        <Stat label="On campus" value={onCampusTotal} />
        <Stat label="Off grounds" value={offGroundsTotal} />
        <Stat label="At home" value={homeTotal} />
        <Stat label="In Health Center" value={hcCount} />
      </section>

      <div className="sections">
        <SectionShell
          id="live-hc"
          num="01"
          title="Health"
          titleEm="Center"
          sub="Students currently checked in."
          meta={`${hcCount} STUDENTS`}
        >
          {hcCount === 0 ? (
            <EmptyState message="No students in HC right now." />
          ) : (
            <div role="list">
              {(hc.data?.students ?? []).map((s) => (
                <div className="row" key={s.id} role="listitem">
                  <div className="row__initials">{s.initials}</div>
                  <div className="row__main">
                    <div className="row__line">{s.name}</div>
                    <div className="row__sub">
                      <span>{s.dorm}</span>
                      <span className="sep" />
                      <span>{s.location}</span>
                      <span className="sep" />
                      <span>since {s.since}</span>
                    </div>
                  </div>
                  <div className="row__meta">
                    {s.status === "overnight" ? (
                      <span className="tag tag--overnight">Overnight</span>
                    ) : (
                      <span className="tag tag--in">In</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionShell>

        <SectionShell
          id="live-off-campus"
          num="02"
          title="Off"
          titleEm="Campus"
          sub="Off-grounds and at-home right now."
          meta={`${offCampusTotal} STUDENTS`}
        >
          {offCampusTotal === 0 ? (
            <EmptyState message="No students currently off campus." />
          ) : (
            <div role="list">
              {(offCampus.data?.students ?? []).slice(0, 30).map((s) => (
                <div className="row" key={s.id} role="listitem">
                  <div className="row__initials">{s.initials}</div>
                  <div className="row__main">
                    <div className="row__line">{s.name}</div>
                    <div className="row__sub">
                      <span>{s.dorm}</span>
                      <span className="sep" />
                      <span>{s.location}</span>
                      <span className="sep" />
                      <span>since {s.since}</span>
                    </div>
                  </div>
                  <div className="row__meta">
                    <span
                      className={
                        s.state === "home"
                          ? "tag tag--in"
                          : "tag tag--overnight"
                      }
                    >
                      {s.state === "home" ? "Home" : "Off-grounds"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionShell>
      </div>

      <SectionShell
        id="live-locations"
        num="03"
        title="Where"
        titleEm="Students Are"
        sub="Counts by location, busiest first."
        meta={`${locations.data?.uniqueLocations ?? 0} LOCATIONS`}
      >
        {(locations.data?.buckets.length ?? 0) === 0 ? (
          <EmptyState message="No live location data." />
        ) : (
          <div className="loc-grid">
            {(locations.data?.buckets ?? []).slice(0, 16).map((b) => (
              <div className="loc-card" key={b.locationId}>
                <div className="loc-card__count">{b.count}</div>
                <div className="loc-card__name">{b.locationName}</div>
                {b.sampleStudents.length > 0 && (
                  <div className="loc-card__sample">
                    {b.sampleStudents.slice(0, 2).join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell
        id="live-alerts"
        num="04"
        title="Pastoral"
        titleEm="Alerts"
        sub="Watchlist or sensitive entries from the last 48 hours."
        meta={`${alerts.data?.alerts.length ?? 0} ENTRIES`}
      >
        {(alerts.data?.alerts.length ?? 0) === 0 ? (
          <EmptyState message="No flagged pastoral entries in the last 48 hours." />
        ) : (
          <div role="list">
            {(alerts.data?.alerts ?? []).map((a) => (
              <div className="row" key={a.id} role="listitem">
                <div className="row__initials">{a.studentInitials}</div>
                <div className="row__main">
                  <div className="row__line">
                    {a.studentName} — {a.category}
                  </div>
                  <div className="row__sub">
                    <span>{a.dorm}</span>
                    <span className="sep" />
                    <span>{formatDateTime(a.date)}</span>
                    <span className="sep" />
                    <span>by {a.createdBy}</span>
                  </div>
                  {a.description && (
                    <div className="row__note">{a.description}</div>
                  )}
                </div>
                <div className="row__meta">
                  {a.watchlist && (
                    <span className="tag tag--watchlist">Watchlist</span>
                  )}
                  {a.sensitive && (
                    <span className="tag tag--sensitive">Sensitive</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell
        id="live-dorm-notes"
        num="05"
        title="Last Night"
        titleEm="Dorm Notes"
        sub={
          dormNotes.data?.configured
            ? `Pastoral category: ${dormNotes.data?.categoryName ?? ""}`
            : "Configure DORM_NOTES_CATEGORY_NAME to enable."
        }
        meta={`${dormNotes.data?.notes.length ?? 0} NOTES`}
      >
        {!dormNotes.data?.configured ? (
          <EmptyState message="Set DORM_NOTES_CATEGORY_NAME to the Orah pastoral category used for nightly dorm notes." />
        ) : (dormNotes.data?.notes.length ?? 0) === 0 ? (
          <EmptyState message="No dorm notes recorded last night." />
        ) : (
          <div role="list">
            {(dormNotes.data?.notes ?? []).map((n) => (
              <div className="row" key={n.id} role="listitem">
                <div className="row__initials">{n.studentInitials}</div>
                <div className="row__main">
                  <div className="row__line">{n.studentName}</div>
                  <div className="row__sub">
                    <span>{n.dorm}</span>
                    <span className="sep" />
                    <span>{formatDateTime(n.date)}</span>
                    <span className="sep" />
                    <span>by {n.createdBy}</span>
                  </div>
                  {n.description && (
                    <div className="row__note">{n.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionShell>

      <footer className="colophon">
        <div>LAS · 1854 Leysin · Internal tool</div>
        <div className="colophon__center">Live snapshot · refreshes every 30s</div>
        <div>v0.1 · Live · {new Date().getFullYear()}</div>
      </footer>

      <Toast message={toast} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}
