"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PastoralCharts } from "@/components/analytics/charts";
import type {
  EnrichedPastoral,
  PastoralFilters,
  PastoralMeta,
  PastoralResponse,
} from "@/types/analytics";

interface Props {
  defaultStart: string;
  defaultEnd: string;
  viewerEmail: string;
}

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

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportCsv(records: EnrichedPastoral[]): void {
  const header = [
    "date",
    "category",
    "student",
    "year",
    "house",
    "watchlist",
    "sensitive",
    "description",
    "action",
    "note",
    "created_by",
  ];
  const rows = records.map((r) =>
    [
      r.date,
      r.category ?? "",
      r.studentName,
      r.yearLevel ?? "",
      r.house ?? "",
      r.watchlist ? "yes" : "",
      r.sensitive ? "yes" : "",
      r.description,
      r.action,
      r.note,
      r.createdBy ?? "",
    ]
      .map(csvEscape)
      .join(","),
  );
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pastoral-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AnalyticsClient({ defaultStart, viewerEmail }: Props) {
  const today = new Date();
  const [startDate, setStartDate] = useState(toDateInput(defaultStart));
  const [endDate, setEndDate] = useState(toDateInput(today.toISOString()));
  const [categories, setCategories] = useState<string[]>([]);
  const [houseIds, setHouseIds] = useState<number[]>([]);
  const [yearLevels, setYearLevels] = useState<string[]>([]);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [search, setSearch] = useState("");

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
      )}&end=${encodeURIComponent(fromDateInput(toDateInput(new Date().toISOString()), true))}`,
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
  }, [defaultStart]);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    const filters: PastoralFilters = {
      startDate: fromDateInput(startDate),
      endDate: fromDateInput(endDate, true),
      categories: categories.length ? categories : undefined,
      houseIds: houseIds.length ? houseIds : undefined,
      yearLevels: yearLevels.length ? yearLevels : undefined,
      watchlistOnly: watchlistOnly || undefined,
      includeSensitive: includeSensitive || undefined,
      search: search.trim() || undefined,
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
  }, [
    startDate,
    endDate,
    categories,
    houseIds,
    yearLevels,
    watchlistOnly,
    includeSensitive,
    search,
  ]);

  // First query when meta lands.
  useEffect(() => {
    if (meta && !data && !error) {
      void runQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  const records = data?.records ?? [];
  const agg = data?.aggregations;

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Zurich",
        day: "2-digit",
        month: "short",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [],
  );

  const toggleArrayValue = <T,>(
    list: T[],
    setter: (v: T[]) => void,
    value: T,
  ) => {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

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
            <span>{records.length} records loaded</span>
          </div>
        </div>
        <div className="masthead__actions">
          <Link href="/" className="btn btn--ghost btn--sm">
            ← Dashboard
          </Link>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => exportCsv(records)}
            disabled={!records.length}
          >
            Export CSV
          </button>
        </div>
      </header>

      <section className="section" id="filters">
        <div className="section__head">
          <div className="section__num">№ 01</div>
          <h2 className="section__title">
            Filter <em>set</em>
          </h2>
          <div className="section__sub">
            Pastoral records are sensitive. Sensitive-flagged entries are
            excluded by default.
          </div>
        </div>

        {metaError && (
          <div className="section__empty">Meta load failed: {metaError}</div>
        )}

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
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="end">End</label>
            <input
              id="end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label htmlFor="search">Search</label>
            <input
              id="search"
              type="text"
              value={search}
              placeholder="text in description / action / note / name"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runQuery();
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 16,
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

        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontFamily: "var(--mono)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--ink-2)",
            }}
          >
            <input
              type="checkbox"
              checked={watchlistOnly}
              onChange={(e) => setWatchlistOnly(e.target.checked)}
            />
            Watchlist only
          </label>
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontFamily: "var(--mono)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--ink-2)",
            }}
          >
            <input
              type="checkbox"
              checked={includeSensitive}
              onChange={(e) => setIncludeSensitive(e.target.checked)}
            />
            Include sensitive
          </label>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void runQuery()}
            disabled={loading}
            style={{ marginLeft: "auto" }}
          >
            {loading ? "Querying…" : "Run query"}
          </button>
        </div>

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

      {agg && (
        <section className="section" id="summary">
          <div className="section__head">
            <div className="section__num">№ 03</div>
            <h2 className="section__title">
              Summary <em>counts</em>
            </h2>
            {data?.meta.sensitiveRedacted && (
              <div className="section__sub">
                Some sensitive-flagged records were excluded. Tick "Include
                sensitive" to see them.
              </div>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 18,
            }}
          >
            <CountList title="By category" rows={agg.byCategory.map((r) => ({ label: r.category, count: r.count }))} />
            <CountList title="By house" rows={agg.byHouse.map((r) => ({ label: r.house, count: r.count }))} />
            <CountList title="By creator" rows={agg.byCreator.slice(0, 8).map((r) => ({ label: r.creator, count: r.count }))} />
            <CountList
              title="Flags"
              rows={[
                { label: "Watchlist", count: agg.watchlistCount },
                { label: "Sensitive", count: agg.sensitiveCount },
                { label: "Total", count: agg.total },
              ]}
            />
          </div>
        </section>
      )}

      <section className="section" id="records">
        <div className="section__head">
          <div className="section__num">№ 04</div>
          <h2 className="section__title">
            Records <em>({records.length})</em>
          </h2>
        </div>
        {records.length === 0 ? (
          <div className="section__empty">
            {loading
              ? "Loading…"
              : "No records match. Widen the date range or clear filters."}
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              border: "1px solid var(--rule)",
              background: "var(--paper-2)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ background: "var(--paper-3)", textAlign: "left" }}>
                  <Th>Date</Th>
                  <Th>Category</Th>
                  <Th>Student</Th>
                  <Th>House</Th>
                  <Th>Description</Th>
                  <Th>Action</Th>
                  <Th>Flags</Th>
                  <Th>Created by</Th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderTop: "1px solid var(--rule-soft)" }}
                  >
                    <Td mono>{dateFmt.format(new Date(r.date))}</Td>
                    <Td>{r.category ?? "—"}</Td>
                    <Td>
                      {r.studentName}
                      {r.yearLevel && (
                        <span style={{ color: "var(--ink-3)" }}>
                          {" "}
                          · Y{r.yearLevel}
                        </span>
                      )}
                    </Td>
                    <Td>{r.house ?? "—"}</Td>
                    <Td>{r.description || r.note || "—"}</Td>
                    <Td>{r.action || "—"}</Td>
                    <Td>
                      {r.watchlist && (
                        <span className="tag tag--overnight">Watch</span>
                      )}
                      {r.sensitive && (
                        <span
                          className="tag"
                          style={{
                            marginLeft: 4,
                            background: "var(--coral-soft)",
                            color: "var(--coral-ink)",
                          }}
                        >
                          Sens.
                        </span>
                      )}
                    </Td>
                    <Td>{r.createdBy ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="colophon">
        <div>LAS · Pastoral analytics</div>
        <div className="colophon__center">Restricted view</div>
        <div>v0.1 · Read-only · {new Date().getFullYear()}</div>
      </footer>
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

function CountList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--ink-3)",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.length === 0 && (
          <span style={{ color: "var(--ink-4)", fontSize: 12 }}>—</span>
        )}
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 10,
              fontSize: 13,
              alignItems: "center",
            }}
          >
            <div
              style={{
                position: "relative",
                background: "var(--paper-2)",
                padding: "4px 8px",
                border: "1px solid var(--rule-soft)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: max ? `${(r.count / max) * 100}%` : 0,
                  background: "var(--moss-soft)",
                  zIndex: 0,
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>{r.label}</span>
            </div>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 12,
                color: "var(--ink-2)",
              }}
            >
              {r.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "10px 12px",
        fontFamily: "var(--mono)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "var(--ink-3)",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <td
      style={{
        padding: "8px 12px",
        verticalAlign: "top",
        fontFamily: mono ? "var(--mono)" : undefined,
        fontSize: mono ? 12 : 13,
        color: "var(--ink)",
      }}
    >
      {children}
    </td>
  );
}
