"use client";

import useSWR from "swr";

import { EmptyState, SectionShell } from "@/components/dashboard/sections";
import type { CalendarEvent } from "@/lib/google-calendar";

interface Props {
  id: string;
  num: string;
  title: string;
  titleEm: string;
  sub: string;
  // Either pass an explicit window or let the API default to days.
  startISO?: string;
  endISO?: string;
  days?: number;
  refreshMs?: number;
  collapsible?: boolean;
}

interface ApiResponse {
  events: CalendarEvent[];
  configured: boolean;
  windowStart?: string;
  windowEnd?: string;
  error?: string;
}

const fetcher = async (url: string): Promise<ApiResponse> => {
  const res = await fetch(url);
  return (await res.json()) as ApiResponse;
};

const TZ = "Europe/Zurich";

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function ActivitiesCalendar({
  id,
  num,
  title,
  titleEm,
  sub,
  startISO,
  endISO,
  days,
  refreshMs = 300_000,
  collapsible = false,
}: Props) {
  const params = new URLSearchParams();
  if (startISO && endISO) {
    params.set("start", startISO);
    params.set("end", endISO);
  } else if (days) {
    params.set("days", String(days));
  }
  const url = `/api/calendar/events${params.toString() ? `?${params}` : ""}`;
  const { data } = useSWR<ApiResponse>(url, fetcher, {
    refreshInterval: refreshMs,
  });

  const events = data?.events ?? [];
  const configured = data?.configured ?? true;
  const meta = `${events.length} EVENT${events.length === 1 ? "" : "S"}`;

  // Group events by local-day for readability.
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = dayKey(e.start);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const orderedDays = Array.from(groups.keys()).sort();

  return (
    <SectionShell
      id={id}
      num={num}
      title={title}
      titleEm={titleEm}
      sub={sub}
      meta={meta}
      collapsible={collapsible}
    >
      {!configured ? (
        <EmptyState message="Calendar not configured. Set GOOGLE_CALENDAR_ID and share the calendar with the service account." />
      ) : data?.error ? (
        <EmptyState message={`Calendar error: ${data.error}`} />
      ) : !data ? (
        <EmptyState message="Loading…" />
      ) : events.length === 0 ? (
        <EmptyState message="No events scheduled in this window." />
      ) : (
        <div role="list">
          {orderedDays.map((day) => {
            const items = groups.get(day) ?? [];
            return (
              <div key={day} className="cal-day">
                <div className="cal-day__header">
                  {formatDay(items[0]!.start)}
                </div>
                {items.map((e) => (
                  <div className="row" key={e.id} role="listitem">
                    <div className="row__initials cal-row__time">
                      {e.allDay
                        ? "All day"
                        : `${formatTime(e.start)}–${formatTime(e.end)}`}
                    </div>
                    <div className="row__main">
                      <div className="row__line">{e.summary}</div>
                      {(e.location || e.description) && (
                        <div className="row__sub">
                          {e.location && <span>{e.location}</span>}
                          {e.location && e.description && (
                            <span className="sep" />
                          )}
                          {e.description && (
                            <span className="cal-row__desc">
                              {e.description}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="row__meta" />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </SectionShell>
  );
}
