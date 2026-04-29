"use client";

import useSWR from "swr";

import { EmptyState, SectionShell } from "@/components/dashboard/sections";

interface PastoralEntry {
  id: number;
  date: string;
  studentName: string;
  studentInitials: string;
  dorm: string;
  category: string;
  description: string;
  createdBy: string;
}

interface Props {
  id: string;
  num: string;
  title: string;
  titleEm: string;
  sub: string;
  emptyMessage: string;
  categories: string[];
  days: number;
  limit?: number;
  refreshMs?: number;
  metaLabel?: string;
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function PastoralFeedSection({
  id,
  num,
  title,
  titleEm,
  sub,
  emptyMessage,
  categories,
  days,
  limit = 50,
  refreshMs = 60_000,
  metaLabel = "ENTRIES",
}: Props) {
  const url = `/api/orah/pastoral-by-category?categories=${encodeURIComponent(
    categories.join(","),
  )}&days=${days}&limit=${limit}`;

  const { data } = useSWR<{ records: PastoralEntry[] }>(url, fetcher, {
    refreshInterval: refreshMs,
  });

  const records = data?.records ?? [];

  return (
    <SectionShell
      id={id}
      num={num}
      title={title}
      titleEm={titleEm}
      sub={sub}
      meta={`${records.length} ${metaLabel}`}
    >
      {records.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div role="list">
          {records.map((r) => (
            <div className="row" key={r.id} role="listitem">
              <div className="row__initials">{r.studentInitials}</div>
              <div className="row__main">
                <div className="row__line">
                  {r.studentName} — {r.category}
                </div>
                <div className="row__sub">
                  <span>{r.dorm}</span>
                  <span className="sep" />
                  <span>{formatDateTime(r.date)}</span>
                  <span className="sep" />
                  <span>by {r.createdBy}</span>
                </div>
                {r.description && (
                  <div className="row__note">{r.description}</div>
                )}
              </div>
              <div className="row__meta">—</div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}
