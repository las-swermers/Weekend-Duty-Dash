"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import { Icon, LASCrest } from "@/components/dashboard/icon";
import { EmptyState, SectionShell } from "@/components/dashboard/sections";
import { Toast } from "@/components/dashboard/toast";
import { PastoralCategoryGrid } from "@/components/shared/pastoral-category-grid";
import { PastoralDormPivot } from "@/components/shared/pastoral-dorm-pivot";
import { signOutAction } from "@/lib/auth-actions";

interface Props {
  userName: string | null;
  todayCategories: string[];
  todayStartISO: string;
  todayEndISO: string;
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
  reason: string;
  since: string;
  status: "in" | "overnight";
  location: string;
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

export function LiveClient({
  userName,
  todayCategories,
  todayStartISO,
  todayEndISO,
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

      {todayCategories.length > 0 ? (
        <PastoralCategoryGrid
          id="live-today"
          num="02"
          title="Today's"
          titleEm="Service"
          sub="Infractions due to be served today, grouped by category."
          emptyMessage="No service entries logged for today yet."
          categories={todayCategories}
          startISO={todayStartISO}
          endISO={todayEndISO}
        />
      ) : (
        <SectionShell
          id="live-today"
          num="02"
          title="Today's"
          titleEm="Service"
          sub="Weekday — clipboards & dorm-night service resume Friday."
          meta="0 ENTRIES"
        >
          <EmptyState message="No service due today." />
        </SectionShell>
      )}

      <PastoralDormPivot
        id="live-24h"
        num="03"
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
      />

      <PastoralDormPivot
        id="live-wednesday-catchup"
        num="04"
        title="Wednesday"
        titleEm="Catch-up"
        sub="Catch-up entries logged for the upcoming Wednesday, grouped by dorm. Resets every Wednesday at midnight."
        emptyMessage="No Wednesday catch-up logged this cycle."
        categories={["Wednesday morning catch-up"]}
        startISO={makeupStartISO}
        endISO={makeupEndISO}
      />

      <PastoralDormPivot
        id="live-wednesday-makeup"
        num="05"
        title="Wednesday"
        titleEm="Make-up Activity"
        sub="Make-up activity entries logged for the upcoming Wednesday, grouped by dorm. Resets every Wednesday at midnight."
        emptyMessage="No Wednesday make-up activity logged this cycle."
        categories={["Wednesday make-up activity"]}
        startISO={makeupStartISO}
        endISO={makeupEndISO}
      />

      <SectionShell
        id="live-dorm-notes"
        num="06"
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
        <div className="colophon__center">
          Live snapshot · refreshes every 30s
        </div>
        <div>v0.1 · Live · {new Date().getFullYear()}</div>
      </footer>

      <Toast message={toast} />
    </div>
  );
}
