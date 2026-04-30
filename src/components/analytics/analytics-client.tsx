"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PastoralCharts } from "@/components/analytics/charts";
import type {
  PastoralFilters,
  PastoralMeta,
  PastoralResponse,
} from "@/types/analytics";

interface Props {
  defaultStart: string;
  defaultEnd: string;
  viewerEmail: string;
}

type Preset = "today" | "week" | "month" | "semester" | "custom";

function toDateInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInput(value: string, endOfDay = false): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function presetRange(preset: Preset): { start: string; end: string } {
  const today = new Date();
  const end = toDateInput(today.toISOString());
  const start = new Date(today);
  if (preset === "today") {
    return { start: end, end };
  }
  if (preset === "week") {
    start.setDate(today.getDate() - 6);
  } else if (preset === "month") {
    start.setDate(today.getDate() - 29);
  } else if (preset === "semester") {
    // NEXT_PUBLIC_* values are inlined into the client bundle, so this var
    // must remain a non-secret integer. Never store API keys or PII in
    // NEXT_PUBLIC_ vars.
    const days = Number(process.env.NEXT_PUBLIC_SEMESTER_DAYS) || 120;
    start.setDate(today.getDate() - (days - 1));
  }
  return { start: toDateInput(start.toISOString()), end };
}

export function AnalyticsClient({ defaultStart, viewerEmail }: Props) {
  const today = new Date();
  const initialEnd = toDateInput(today.toISOString());
  const [preset, setPreset] = useState<Preset>("month");
  const [startDate, setStartDate] = useState(toDateInput(defaultStart));
  const [endDate, setEndDate] = useState(initialEnd);
  const [categories, setCategories] = useState<string[]>([]);
  const [houseIds, setHouseIds] = useState<number[]>([]);
  const [yearLevels, setYearLevels] = useState<string[]>([]);

  const [meta, setMeta] = useState<PastoralMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [data, setData] = useState<PastoralResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch(
      `/api/orah/pastoral/meta?start=${encodeURIComponent(
        fromDateInput(toDateInput(defaultStart)),
      )}&end=${encodeURIComponent(fromDateInput(initialEnd, true))}`,
      { signal: ac.signal },
    )
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<PastoralMeta>;
      })
      .then(setMeta)
      .catch((err) => {
        if (err.name !== "AbortError") setMetaError(err.message);
      });
    return () => ac.abort();
  }, [defaultStart, initialEnd]);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    const filters: PastoralFilters = {
      startDate: fromDateInput(startDate),
      endDate: fromDateInput(endDate, true),
      categories: categories.length ? categories : undefined,
      houseIds: houseIds.length ? houseIds : undefined,
      yearLevels: yearLevels.length ? yearLevels : undefined,
    };
    try {
      const res = await fetch("/api/orah/pastoral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as PastoralResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, categories, houseIds, yearLevels]);

  // Re-run when the date window or filters change.
  useEffect(() => {
    if (!meta) return;
    void runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, startDate, endDate, categories, houseIds, yearLevels]);

  const agg = data?.aggregations;

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === "custom") return;
    const { start, end } = presetRange(p);
    setStartDate(start);
    setEndDate(end);
  };

  const onCustomDate =
    (which: "start" | "end") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPreset("custom");
      if (which === "start") setStartDate(e.target.value);
      else setEndDate(e.target.value);
    };

  const toggleArrayValue = <T,>(
    list: T[],
    setter: (v: T[]) => void,
    value: T,
  ) => {
    setter(
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    );
  };

  const topCategory = useMemo(() => {
    if (!agg?.byCategory.length) return null;
    return agg.byCategory[0];
  }, [agg]);

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
            <span>Viewer · {viewerEmail || "—"}</span>
            <span className="dot" />
            <span>{startDate || "—"} → {endDate || "—"}</span>
            {loading && (
              <>
                <span className="dot" />
                <span>loading…</span>
              </>
            )}
          </div>
        </div>
        <div className="masthead__actions">
          <Link href="/weekend" className="btn btn--ghost btn--sm">
            ← Dashboard
          </Link>
          <Link href="/live" className="btn btn--ghost btn--sm">
            Live
          </Link>
        </div>
      </header>

      <section className="section" id="range">
        <div className="section__head">
          <div className="section__num">№ 01</div>
          <h2 className="section__title">
            Time <em>window</em>
          </h2>
          <div className="section__sub">
            Pick a preset or use custom dates. All metrics below recompute
            automatically.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {(
            [
              ["today", "Today"],
              ["week", "Week"],
              ["month", "Month"],
              ["semester", "Semester"],
              ["custom", "Custom"],
            ] as Array<[Preset, string]>
          ).map(([key, label]) => {
            const on = preset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={on ? "btn btn--primary btn--sm" : "btn btn--ghost btn--sm"}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 16,
          }}
        >
          <div className="field">
            <label htmlFor="start">Start</label>
            <input
              id="start"
              type="date"
              value={startDate}
              onChange={onCustomDate("start")}
            />
          </div>
          <div className="field">
            <label htmlFor="end">End</label>
            <input
              id="end"
              type="date"
              value={endDate}
              onChange={onCustomDate("end")}
            />
          </div>
        </div>

        {metaError && (
          <div className="section__empty">Meta load failed: {metaError}</div>
        )}

        <details className="analytics-filters">
          <summary className="analytics-filters__summary">
            Filters
            {(categories.length || houseIds.length || yearLevels.length) > 0 ? (
              <span className="analytics-filters__count">
                · {categories.length + houseIds.length + yearLevels.length} active
              </span>
            ) : null}
          </summary>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              marginTop: 14,
              marginBottom: 4,
            }}
          >
            <FilterChips
              label="Categories"
              options={meta?.categories ?? []}
              selected={categories}
              toggle={(v) => toggleArrayValue(categories, setCategories, v)}
            />
            <FilterChips
              label="Houses"
              options={(meta?.houses ?? []).map((h) => h.name)}
              selected={houseIds
                .map((id) => meta?.houses.find((h) => h.id === id)?.name)
                .filter((v): v is string => !!v)}
              toggle={(name) => {
                const found = meta?.houses.find((h) => h.name === name);
                if (!found) return;
                toggleArrayValue(houseIds, setHouseIds, found.id);
              }}
            />
            <FilterChips
              label="Year level"
              options={meta?.yearLevels ?? []}
              selected={yearLevels}
              toggle={(v) => toggleArrayValue(yearLevels, setYearLevels, v)}
            />
          </div>
        </details>

        {error && (
          <div
            className="section__empty"
            style={{ marginTop: 14, color: "var(--coral-ink)" }}
          >
            {error}
          </div>
        )}
      </section>

      {agg && (
        <section className="stat-grid" id="snapshot">
          <Stat label="Total notes" value={agg.total} />
          <Stat label="Watchlist" value={agg.watchlistCount} />
          <Stat label="Sensitive" value={agg.sensitiveCount} />
          <Stat
            label="Top category"
            value={topCategory?.count ?? 0}
            sub={topCategory?.category ?? "—"}
          />
        </section>
      )}

      {agg && (
        <section className="section" id="charts">
          <div className="section__head">
            <div className="section__num">№ 02</div>
            <h2 className="section__title">
              Visual <em>summary</em>
            </h2>
            <div className="section__sub">
              Trends and breakdowns over the selected window.
            </div>
          </div>
          <PastoralCharts
            byDay={agg.byDay}
            byCategory={agg.byCategory}
            byHouse={agg.byHouse}
            watchlistCount={agg.watchlistCount}
            sensitiveCount={agg.sensitiveCount}
          />
        </section>
      )}

      {!agg && !loading && (
        <section className="section">
          <div className="section__empty">
            No data yet — pick a preset above.
          </div>
        </section>
      )}
    </div>
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

function FilterChips({
  label,
  options,
  selected,
  toggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  toggle: (v: string) => void;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--ink-3)",
          marginBottom: 6,
        }}
      >
        {label}
        {selected.length > 0 && ` · ${selected.length} selected`}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          maxHeight: 120,
          overflowY: "auto",
        }}
      >
        {options.length === 0 ? (
          <span style={{ color: "var(--ink-4)", fontSize: 12 }}>
            (none in window)
          </span>
        ) : (
          options.map((opt) => {
            const on = selected.includes(opt);
            return (
              <button
                type="button"
                key={opt}
                onClick={() => toggle(opt)}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  fontFamily: "var(--mono)",
                  border: `1px solid ${on ? "var(--ink)" : "var(--rule)"}`,
                  background: on ? "var(--ink)" : "var(--paper-2)",
                  color: on ? "var(--paper)" : "var(--ink-2)",
                  cursor: "pointer",
                  borderRadius: "var(--radius)",
                }}
              >
                {opt}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
