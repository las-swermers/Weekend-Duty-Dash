"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import { Icon, LASCrest } from "@/components/dashboard/icon";
import { EmptyState, SectionShell } from "@/components/dashboard/sections";
import { Toast } from "@/components/dashboard/toast";
import { ActivitiesCalendar } from "@/components/shared/activities-calendar";
import { PastoralCategoryGrid } from "@/components/shared/pastoral-category-grid";
import { PastoralDormPivot } from "@/components/shared/pastoral-dorm-pivot";
import { signOutAction } from "@/lib/auth-actions";

interface Props {
  userName: string | null;
  todayCategories: string[];
  todayStartISO: string;
  todayEndISO: string;
  weekendStartISO: string;
  weekendEndISO: string;
  weekendBucketISO: string;
  weekendCategories: string[];
  makeupStartISO: string;
  makeupEndISO: string;
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
  roomNumber?: string;
  reason: string;
  location: string;
  locationId: number;
  isRestInRoom: boolean;
  status: "in" | "discharged";
  checkInISO: string;
  checkOutISO?: string;
  durationMinutes: number;
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

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function HCRoster({ students }: { students: HCStudent[] }) {
  const groups = new Map<string, HCStudent[]>();
  for (const s of students) {
    const key = s.isRestInRoom ? "Rest in Room" : s.location;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const orderedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "Rest in Room") return 1;
    if (b === "Rest in Room") return -1;
    return a.localeCompare(b);
  });

  for (const list of groups.values()) {
    list.sort((a, b) => {
      if (a.status !== b.status) return a.status === "in" ? -1 : 1;
      if (a.status === "in") {
        return a.checkInISO.localeCompare(b.checkInISO); // longer stay first
      }
      return (b.checkOutISO ?? "").localeCompare(a.checkOutISO ?? "");
    });
  }

  return (
    <div role="list">
      {orderedKeys.map((key) => {
        const list = groups.get(key) ?? [];
        const activeCount = list.filter((s) => s.status === "in").length;
        return (
          <div key={key} className="hc-group">
            <div className="hc-group__header">
              <span className="hc-group__title">{key}</span>
              <span className="hc-group__count">
                {list.length} · {activeCount} in now
              </span>
            </div>
            {list.map((s) => (
              <div className="row" key={s.id} role="listitem">
                <div className="row__initials">{s.initials}</div>
                <div className="row__main">
                  <div className="row__line">{s.name}</div>
                  <div className="row__sub">
                    <span>{s.dorm}</span>
                    {s.isRestInRoom && s.roomNumber && (
                      <>
                        <span className="sep" />
                        <span>Rm {s.roomNumber}</span>
                      </>
                    )}
                    <span className="sep" />
                    <span>
                      {formatTime(s.checkInISO)}
                      {s.checkOutISO ? `–${formatTime(s.checkOutISO)}` : ""}
                    </span>
                    <span className="sep" />
                    <span>{formatDuration(s.durationMinutes)}</span>
                  </div>
                </div>
                <div className="row__meta">
                  {s.status === "in" ? (
                    <span className="tag tag--in-now">In now</span>
                  ) : (
                    <span className="tag tag--discharged">
                      Out {formatTime(s.checkOutISO!)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function LiveClient({
  userName,
  todayCategories,
  todayStartISO,
  todayEndISO,
  weekendStartISO,
  weekendEndISO,
  weekendBucketISO,
  weekendCategories,
  makeupStartISO,
  makeupEndISO,
}: Props) {
  const hc = useSWR<{ students: HCStudent[] }>(
    "/api/orah/health-center-live",
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
  const [now, setNow] = useState<string>(() =>
    formatTime(new Date().toISOString()),
  );

  useEffect(() => {
    const id = setInterval(
      () => setNow(formatTime(new Date().toISOString())),
      30_000,
    );
    return () => clearInterval(id);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([hc.mutate(), dormNotes.mutate()]);
    setRefreshing(false);
    setToast("Live data refreshed");
    window.setTimeout(() => setToast(null), 2000);
  }, [hc, dormNotes]);

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
          <Link href="/weekend" className="btn btn--ghost btn--sm">
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

      <SectionShell
        id="live-hc"
        num="01"
        title="Health"
        titleEm="Center"
        sub="Everyone seen in HC or on a rest pass since 05:00 today."
        meta={`${hcCount} STUDENTS`}
        collapsible
      >
        {hcCount === 0 ? (
          <EmptyState message="No HC visits logged today." />
        ) : (
          <HCRoster students={hc.data?.students ?? []} />
        )}
      </SectionShell>

      <PastoralCategoryGrid
        id="live-today"
        num="02"
        title="Today's"
        titleEm="Infractions"
        sub="Early check-ins and any clipboard / dorm-night entries dated today."
        emptyMessage="No infractions to serve today."
        categories={todayCategories}
        startISO={todayStartISO}
        endISO={todayEndISO}
        enableTickOff
        bucketISO={weekendBucketISO}
        collapsible
      />

      <PastoralCategoryGrid
        id="live-weekend"
        num="03"
        title="Weekend"
        titleEm="Infractions"
        sub="Rolling preview of every infraction logged for the upcoming weekend."
        emptyMessage="No weekend infractions logged yet."
        categories={weekendCategories}
        startISO={weekendStartISO}
        endISO={weekendEndISO}
        enableTickOff
        bucketISO={weekendBucketISO}
        collapsible
      />

      <PastoralDormPivot
        id="live-24h"
        num="04"
        title="Infractions"
        titleEm="Last 24 Hours"
        sub="Discipline, concerns, early check-ins, and uniform violations from the past day, grouped by dorm."
        emptyMessage="Nothing logged in the last 24 hours."
        categories={[
          "Phone violation",
          "Concern",
          "1-hour early check-in",
          "2-hour early check-in",
          "Uniform violation",
        ]}
        days={1}
        collapsible
      />

      <PastoralDormPivot
        id="live-wednesday-catchup"
        num="05"
        title="Wednesday"
        titleEm="Catch-up"
        sub="Catch-up entries logged for the upcoming Wednesday, grouped by dorm. Resets every Wednesday at midnight."
        emptyMessage="No Wednesday catch-up logged this cycle."
        categories={["Wednesday morning catch-up"]}
        startISO={makeupStartISO}
        endISO={makeupEndISO}
        enableTickOff
        bucketISO={makeupStartISO}
        collapsible
      />

      <PastoralDormPivot
        id="live-wednesday-makeup"
        num="06"
        title="Wednesday"
        titleEm="Make-up Activity"
        sub="Make-up activity entries logged for the upcoming Wednesday, grouped by dorm. Resets every Wednesday at midnight."
        emptyMessage="No Wednesday make-up activity logged this cycle."
        categories={["Wednesday make-up activity"]}
        startISO={makeupStartISO}
        endISO={makeupEndISO}
        enableTickOff
        bucketISO={makeupStartISO}
        collapsible
      />

      <SectionShell
        id="live-dorm-notes"
        num="07"
        title="Last Night"
        titleEm="Dorm Notes"
        sub={
          dormNotes.data?.configured
            ? `Pastoral category: ${dormNotes.data?.categoryName ?? ""}`
            : "Configure DORM_NOTES_CATEGORY_NAME to enable."
        }
        meta={`${dormNotes.data?.notes.length ?? 0} NOTES`}
        collapsible
      >
        {!dormNotes.data?.configured ? (
          <EmptyState message="Set DORM_NOTES_CATEGORY_NAME to the Orah pastoral category used for nightly dorm notes." />
        ) : (dormNotes.data?.notes.length ?? 0) === 0 ? (
          <EmptyState message="No dorm notes recorded last night." />
        ) : (
          <div
            role="list"
            className={
              (dormNotes.data?.notes.length ?? 0) > 4
                ? "row-grid--two"
                : undefined
            }
          >
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

      <ActivitiesCalendar
        id="live-calendar"
        num="08"
        title="Activities"
        titleEm="Calendar"
        sub="Upcoming events from the activities office calendar."
        days={3}
        collapsible
      />

      <footer className="colophon">
        <div>LAS · 1854 Leysin · Internal tool</div>
        <div className="colophon__center">
          Live snapshot · refreshes every 30s
        </div>
        <div>v0.1 · Live · {new Date().getFullYear()}</div>
      </footer>

      <Toast message={toast} />
    </div>
  );
}
