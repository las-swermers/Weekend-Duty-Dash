"use client";

import { useEffect, useMemo, useState } from "react";

import { ResolutionCharts } from "@/components/analytics/resolution-charts";

interface BucketStat {
  label: string;
  count: number;
}

export interface ResolutionResponse {
  windowStart: string;
  windowEnd: string;
  totalResolved: number;
  uniqueStaff: number;
  avgTimeToResolutionMs: number | null;
  byStaff: BucketStat[];
  byDorm: BucketStat[];
  byCategory: BucketStat[];
  byDay: { day: string; count: number }[];
}

interface Props {
  startISO: string;
  endISO: string;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.round((ms / 3_600_000) * 10) / 10;
  if (hours < 48) return `${hours}h`;
  const days = Math.round((ms / 86_400_000) * 10) / 10;
  return `${days}d`;
}

export function ResolutionPanel({ startISO, endISO }: Props) {
  const [data, setData] = useState<ResolutionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!startISO || !endISO) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch(
      `/api/analytics/resolution?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
      { signal: ac.signal },
    )
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        return (await r.json()) as ResolutionResponse;
      })
      .then(setData)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [startISO, endISO]);

  const topStaff = useMemo(
    () => (data?.byStaff ?? []).slice(0, 5),
    [data],
  );

  return (
    <section className="section" id="resolution">
      <div className="section__head">
        <div className="section__num">№ 03</div>
        <h2 className="section__title">
          Resolution <em>tracking</em>
        </h2>
        <div className="section__sub">
          Tick-off completions across all bucketed cycles in the window.
          {loading && " · loading…"}
        </div>
      </div>

      {error && (
        <div className="section__empty" style={{ color: "var(--coral-ink)" }}>
          {error}
        </div>
      )}

      {data && data.totalResolved === 0 && !error && (
        <div className="section__empty">No resolutions logged in this window.</div>
      )}

      {data && data.totalResolved > 0 && (
        <>
          <div className="stat-grid">
            <Stat label="Resolutions" value={data.totalResolved} />
            <Stat label="Avg time to serve" value={formatDuration(data.avgTimeToResolutionMs)} />
            <Stat label="Active staff" value={data.uniqueStaff} />
            <Stat
              label="Top staff"
              value={topStaff[0]?.count ?? 0}
              sub={topStaff[0]?.label ?? "—"}
            />
          </div>
          <ResolutionCharts
            byCategory={data.byCategory}
            byDorm={data.byDorm}
            byStaff={data.byStaff}
            byDay={data.byDay}
          />
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
      {sub && (
        <div
          className="stat__label"
          style={{ marginTop: 2, color: "var(--ink-4)", textTransform: "none" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
