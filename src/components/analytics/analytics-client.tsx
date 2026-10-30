"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ReportsAdminLink } from "@/components/reports/admin-link";
import type { AnalyticsData } from "@/lib/analytics/types";
import {
  durationBounds,
  waitingHours,
  watchMetrics,
} from "@/lib/analytics/watchlist";
import { localDay } from "@/lib/analytics/range";
import { weekKey, weekRange } from "@/lib/dates";
import "./analytics.css";

type View = "overview" | "consequences" | "warnings" | "rest" | "trends";
const views: [View, string][] = [
  ["overview", "Overview"],
  ["consequences", "Consequences"],
  ["warnings", "Warnings & follow-up"],
  ["rest", "Health Center & rest"],
  ["trends", "Trends & dorms"],
];
const stamp = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Zurich",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso))
    : "Unknown";
const hours = (n: number | null) =>
  n === null ? "—" : n < 48 ? `${n.toFixed(1)}h` : `${(n / 24).toFixed(1)}d`;
const bounds = (lo: number | null, hi: number | null) =>
  lo === null || hi === null
    ? "Not yet measured"
    : hi < 96
      ? `${lo.toFixed(1)}–${hi.toFixed(1)}h`
      : `${(lo / 24).toFixed(1)}–${(hi / 24).toFixed(1)}d`;
const initialRange = () => {
  const r = weekRange(new Date(), -1);
  return { start: localDay(r.start), end: localDay(r.end) };
};

export function AnalyticsClient({
  viewerEmail,
}: {
  defaultStart: string;
  defaultEnd: string;
  viewerEmail: string;
}) {
  const [range, setRange] = useState(initialRange);
  const [dorm, setDorm] = useState("");
  const [view, setView] = useState<View>("overview");
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [houses, setHouses] = useState<AnalyticsData["houses"]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [student, setStudent] = useState<number | null>(null);
  const [drill, setDrill] = useState<{ title: string; ids: number[] } | null>(
    null,
  );
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [targetRows, setTargetRows] = useState<
    { category: string; hours: string }[]
  >([]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    try {
      setDorm(
        params.get("dorm") ?? localStorage.getItem("analytics.dorm") ?? "374",
      );
    } catch {
      setDorm(params.get("dorm") ?? "374");
    }
    if (params.has("start") && params.has("end"))
      setRange({ start: params.get("start")!, end: params.get("end")! });
    const selected = params.get("view");
    if (views.some(([v]) => v === selected)) setView(selected as View);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    setStudent(null);
    setDrill(null);
    const params = new URLSearchParams({ ...range, dorm });
    try {
      localStorage.setItem("analytics.dorm", dorm);
    } catch {}
    fetch(`/api/analytics/overview?${params}`, { signal: abort.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Could not load analytics.");
        return j as AnalyticsData;
      })
      .then((j) => {
        setData(j);
        setHouses(j.houses);
        setTargetRows(
          Object.entries(j.watch?.targets ?? {}).map(([category, hours]) => ({
            category,
            hours: String(hours),
          })),
        );
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [ready, range, dorm, revision]);
  useEffect(() => {
    if (!ready) return;
    window.history.replaceState(
      null,
      "",
      `/analytics?${new URLSearchParams({ ...range, dorm, view })}`,
    );
  }, [ready, range, dorm, view]);
  useEffect(() => {
    if (student !== null || drill)
      document
        .getElementById("an-details")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [student, drill]);

  const m = data?.watch?.observedAt ? data.watch.metrics : undefined;
  const episodes = data?.watch?.episodes ?? [];
  const labelFor = (id: string) => episodes.find((e) => e.id === id);
  const matches = (s: { name: string; dorm: string }) =>
    `${s.name} ${s.dorm}`.toLowerCase().includes(search.toLowerCase());
  const studentName =
    data?.pastoral?.records.find((r) => r.studentId === student)?.name ??
    episodes.find((e) => e.studentId === student)?.name ??
    data?.rest?.visits.find((r) => r.studentId === student)?.name ??
    data?.rest?.now?.students.find((r) => r.studentId === student)?.name ??
    data?.warnings?.students.find((s) => s.studentId === student)?.name;
  const records = useMemo(
    () =>
      data?.pastoral?.records.filter(
        (r) =>
          (student === null || r.studentId === student) &&
          (!drill || drill.ids.includes(r.id)),
      ) ?? [],
    [data, student, drill],
  );
  const showStudent = (id: number) => {
    setStudent(id);
    setDrill(null);
  };
  const showRecords = (
    title: string,
    predicate: (
      r: NonNullable<AnalyticsData["pastoral"]>["records"][number],
    ) => boolean,
  ) => {
    setStudent(null);
    setDrill({
      title,
      ids: data?.pastoral?.records.filter(predicate).map((r) => r.id) ?? [],
    });
  };
  const nameButton = (id: number, name: string) => (
    <button className="an-link" onClick={() => showStudent(id)}>
      {name}
    </button>
  );
  const preset = (kind: "this" | "last" | "four" | "eight") => {
    const last = weekRange(new Date(), kind === "this" ? 0 : -1);
    const first = weekRange(
      last.start,
      kind === "four" ? -3 : kind === "eight" ? -7 : 0,
    );
    setRange({
      start: localDay(first.start),
      end: localDay(kind === "this" ? new Date() : last.end),
    });
  };
  async function mutate(method: "POST" | "PUT") {
    setBusy(true);
    setStatus("");
    try {
      if (
        method === "PUT" &&
        new Set(targetRows.map((r) => r.category.trim().toLowerCase())).size !==
          targetRows.length
      )
        throw new Error("Each category needs a unique target.");
      const res = await fetch("/api/analytics/tracking", {
        method,
        headers: { "Content-Type": "application/json" },
        body:
          method === "PUT"
            ? JSON.stringify({
                targets: Object.fromEntries(
                  targetRows.map((r) => [r.category, Number(r.hours)]),
                ),
              })
            : undefined,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setStatus(
        method === "PUT"
          ? "Targets saved. Metrics use these current targets."
          : "Watchlist observation saved.",
      );
      setRevision((r) => r + 1);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app an-app" data-density="balanced">
      <header className="masthead">
        <div>
          <div className="masthead__crest">
            Leysin American School · Student life
          </div>
          <h1 className="masthead__title">
            Dorm <em>insights</em>
          </h1>
          <p className="an-muted">
            See what needs attention, how quickly consequences are served, and
            what is changing.
          </p>
        </div>
        <div className="masthead__actions an-no-print">
          <ReportsAdminLink />
          <Link className="btn btn--ghost btn--sm" href="/live">
            Live dashboard
          </Link>
          <Link className="btn btn--ghost btn--sm" href="/weekend">
            Weekend
          </Link>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => window.print()}
          >
            Print this view
          </button>
        </div>
      </header>
      <section className="an-toolbar" aria-label="Analytics filters">
        <label>
          Dorm
          <select
            aria-label="Dorm"
            value={dorm}
            onChange={(e) => setDorm(e.target.value)}
          >
            <option value="">All dorms</option>
            {!houses.length && dorm && <option value={dorm}>Savoy</option>}
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={range.start}
            onChange={(e) => setRange({ ...range, start: e.target.value })}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            max={localDay(new Date())}
            value={range.end}
            onChange={(e) => setRange({ ...range, end: e.target.value })}
          />
        </label>
        <div className="an-presets">
          <button onClick={() => preset("this")}>This week</button>
          <button onClick={() => preset("last")}>Last week</button>
          <button onClick={() => preset("four")}>4 complete weeks</button>
          <button onClick={() => preset("eight")}>8 complete weeks</button>
        </div>
        <button
          className="btn btn--ghost btn--sm"
          disabled={loading}
          onClick={() => setRevision((r) => r + 1)}
        >
          Refresh view
        </button>
      </section>
      <nav className="an-tabs an-no-print" aria-label="Analytics views">
        {views.map(([key, title]) => (
          <button
            key={key}
            aria-current={view === key ? "page" : undefined}
            onClick={() => {
              setView(key);
              setSearch("");
              setStudent(null);
              setDrill(null);
            }}
          >
            {title}
          </button>
        ))}
      </nav>
      <p className="an-muted">
        Swiss time · {range.start} to {range.end} · {data?.rosterCount ?? "—"}{" "}
        students on current roster
        {data ? ` · Loaded ${stamp(data.pulledAt)}` : ""}
      </p>
      {loading && (
        <div role="status" className="an-notice">
          Loading records and matching follow-ups…
        </div>
      )}
      {error && (
        <div role="alert" className="an-notice">
          {error}{" "}
          <button onClick={() => setRevision((r) => r + 1)}>Retry</button>
        </div>
      )}
      {data?.issues.map((issue) => (
        <div className="an-notice" key={issue}>
          {issue}
        </div>
      ))}
      {data && (
        <>
          {(view === "overview" || view === "consequences") && (
            <>
              <h2>Time to consequence served</h2>
              <p className="an-muted">
                Watchlist added → manually removed. Removal is the school’s
                recorded confirmation that the consequence was served. Calendar
                hours, including weekends.
              </p>
              {!data.watch?.observedAt ? (
                <div className="an-notice">
                  Tracking has not started. The first successful collection
                  establishes a baseline; existing flags have an unknown start.
                </div>
              ) : (
                <p className="an-notice">
                  Tracking since {stamp(data.watch.startedAt)} · last
                  observation {stamp(data.watch.observedAt)}. Changes are
                  bounded between scans, so durations are shown as ranges.
                  {Date.now() - Date.parse(data.watch.observedAt) >
                  36 * 3600_000
                    ? " Collection is stale; outstanding status may have changed."
                    : ""}
                  {Date.parse(data.end) > Date.parse(data.watch.observedAt)
                    ? " Status after the last observation is unverified."
                    : ""}
                </p>
              )}
              <div className="an-stats">
                <Metric
                  label="Median time to serve"
                  value={
                    m
                      ? bounds(m.medianMinHours, m.medianMaxHours)
                      : "Unavailable"
                  }
                  sub={`${m?.measured ?? 0} completed episodes with bounded starts`}
                />
                <Metric
                  label="Average time to serve"
                  value={
                    m
                      ? bounds(m.averageMinHours, m.averageMaxHours)
                      : "Unavailable"
                  }
                  sub="Observed ranges, not exact timestamps"
                />
                <Metric
                  label="Within target"
                  value={
                    m?.withinPercent == null
                      ? "Not yet classifiable"
                      : `${m.withinPercent}%`
                  }
                  sub={`${m?.within ?? 0} within · ${m?.late ?? 0} late · ${m?.uncertain ?? 0} uncertain · ${m?.targetUnknown ?? 0} unmeasured`}
                />
                <Metric
                  label="Outstanding at cutoff"
                  value={m?.open.length ?? "—"}
                  sub={`${m?.overdue ?? 0} definitely beyond their target`}
                  onClick={() => setView("consequences")}
                />
              </div>
              <div className="an-strip">
                <span>
                  <strong>{m?.added ?? "—"}</strong> additions observed
                </span>
                <span>
                  <strong>{m?.served ?? "—"}</strong> removals counted as served
                </span>
                <span>
                  <strong>{m?.expiryPossible ?? "—"}</strong> possible
                  expirations excluded
                </span>
                <span>
                  <strong>{m ? m.added - m.served : "—"}</strong> additions
                  minus served
                </span>
              </div>
              <p className="an-muted">
                Period counts use observation dates. Baseline flags are excluded
                from additions. Possible expirations and unknown starts stay
                separate; target percentages exclude uncertain and unmeasured
                cases. A removal observed after the cutoff may have occurred
                before it.
              </p>
            </>
          )}
          {view === "overview" && (
            <>
              <div className="an-stats">
                <Metric
                  label="Pastoral records"
                  value={data.pastoral?.total ?? "—"}
                  sub={`${data.pastoral?.students ?? "—"} distinct students`}
                  onClick={() => setView("trends")}
                />
                <Metric
                  label="Conversations due"
                  value={
                    data.warnings?.students.filter((s) => s.dueNow).length ??
                    "—"
                  }
                  sub={`Week of ${data.warnings?.week ?? "—"}; includes carry-forward`}
                  onClick={() => setView("warnings")}
                />
                <Metric
                  label="Students with rest activity"
                  value={data.rest?.summary.students ?? "—"}
                  sub={`${data.rest?.summary.visits ?? "—"} recorded visits`}
                  onClick={() => setView("rest")}
                />
                <Metric
                  label="Paired rest hours"
                  value={
                    data.rest ? data.rest.summary.totalHours.toFixed(1) : "—"
                  }
                  sub="Recorded paired intervals overlapping the date range"
                  onClick={() => setView("rest")}
                />
              </div>
              {data.pastoral && (
                <Bars
                  title="Pastoral activity by category"
                  rows={data.pastoral.categories}
                  onSelect={(cat) =>
                    showRecords(cat, (r) => r.category === cat)
                  }
                />
              )}
            </>
          )}
          {view === "consequences" && (
            <>
              <h2>Eight-week backlog history</h2>
              <DataTable
                headers={[
                  "Week starting",
                  "Additions observed",
                  "Served",
                  "Outstanding at cutoff",
                ]}
                rows={Array.from({ length: 8 }, (_, i) => {
                  const r = weekRange(new Date(data.end), i - 7);
                  const end = new Date(
                    Math.min(+r.end, Date.parse(data.end)),
                  ).toISOString();
                  const stats = watchMetrics(
                    episodes,
                    r.start.toISOString(),
                    end,
                    {},
                  );
                  const covered =
                    data.watch?.startedAt &&
                    Date.parse(data.watch.startedAt) <= +r.start;
                  const observed =
                    data.watch?.observedAt &&
                    Date.parse(data.watch.observedAt) >= Date.parse(end);
                  return [
                    localDay(r.start),
                    covered ? stats.added : "Partial / not tracked",
                    covered ? stats.served : "Partial / not tracked",
                    covered && observed
                      ? stats.open.length
                      : "Partial / not tracked",
                  ];
                })}
              />
              <h2>Response by consequence type</h2>
              <DataTable
                headers={[
                  "Category",
                  "Served",
                  "Measured",
                  "Median elapsed time",
                  "Outstanding",
                  "Overdue",
                ]}
                rows={(data.watch?.categories ?? []).map((category) => {
                  const rows = episodes.filter(
                    (e) => e.category.toLowerCase() === category.toLowerCase(),
                  );
                  const targets = Object.fromEntries(
                    rows
                      .map((e) => [e.category, data.watch?.targets[category]])
                      .filter(([, v]) => v !== undefined),
                  ) as Record<string, number>;
                  const stats = watchMetrics(
                    rows,
                    data.start,
                    data.end,
                    targets,
                  );
                  return [
                    category,
                    stats.served,
                    stats.measured,
                    bounds(stats.medianMinHours, stats.medianMaxHours),
                    stats.open.length,
                    stats.overdue,
                  ];
                })}
              />
              <Bars
                title="Outstanding age · verified minimum waiting time"
                rows={[
                  {
                    label: "Under 24 hours",
                    count: (m?.open ?? []).filter(
                      (e) => waitingHours(e, data.end) < 24,
                    ).length,
                  },
                  {
                    label: "1–3 days",
                    count: (m?.open ?? []).filter(
                      (e) =>
                        waitingHours(e, data.end) >= 24 &&
                        waitingHours(e, data.end) < 72,
                    ).length,
                  },
                  {
                    label: "3–7 days",
                    count: (m?.open ?? []).filter(
                      (e) =>
                        waitingHours(e, data.end) >= 72 &&
                        waitingHours(e, data.end) < 168,
                    ).length,
                  },
                  {
                    label: "7 days or more",
                    count: (m?.open ?? []).filter(
                      (e) => waitingHours(e, data.end) >= 168,
                    ).length,
                  },
                ]}
                onSelect={() =>
                  document
                    .getElementById("an-outstanding")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              />
              <h2 id="an-outstanding">Outstanding consequences</h2>
              <Search value={search} onChange={setSearch} />
              <DataTable
                headers={[
                  "Student",
                  "Dorm / category",
                  "First observed flagged",
                  "Waiting at least",
                  "Target",
                ]}
                rows={(m?.open ?? [])
                  .map((e) => ({ ...e, ...labelFor(e.id) }))
                  .filter((e) =>
                    matches({ name: e.name ?? "", dorm: e.dorm ?? "" }),
                  )
                  .sort((a, b) => a.startBy.localeCompare(b.startBy))
                  .map((e) => [
                    nameButton(e.studentId, e.name ?? "Unknown student"),
                    `${e.dorm} · ${e.category}`,
                    <>
                      {stamp(e.startBy)}
                      {!e.startAfter && <small>Start unknown · baseline</small>}
                    </>,
                    <>
                      {hours(waitingHours(e, data.end))}
                      <small>Verified through {stamp(e.activeThrough)}</small>
                    </>,
                    data.watch?.targets[e.category]
                      ? hours(data.watch.targets[e.category])
                      : "Not set",
                  ])}
                empty="No outstanding cases in the available observations."
              />
              <h2>Removals observed in this period</h2>
              <DataTable
                headers={[
                  "Student",
                  "Category",
                  "Removal observed",
                  "Time on watchlist",
                  "Outcome",
                ]}
                rows={(m?.closed ?? [])
                  .map((e) => ({ ...e, ...labelFor(e.id) }))
                  .filter((e) =>
                    matches({ name: e.name ?? "", dorm: e.dorm ?? "" }),
                  )
                  .map((e) => {
                    const d = durationBounds(e);
                    return [
                      nameButton(e.studentId, e.name ?? "Unknown student"),
                      e.category,
                      stamp(e.endBy),
                      d ? bounds(d.minHours, d.maxHours) : "Start unknown",
                      e.outcome === "served"
                        ? "Served (manual-removal workflow)"
                        : "Possible expiry · excluded",
                    ];
                  })}
              />
              {data.admin && (
                <details
                  className="an-panel an-no-print"
                  open={adminOpen}
                  onToggle={(event) => setAdminOpen(event.currentTarget.open)}
                >
                  <summary>Admin · collection and response targets</summary>
                  <p>
                    Daily collection is scheduled at 04:00 UTC. A more frequent
                    scheduler can call the protected collection endpoint.
                    Targets are elapsed hours and apply to historical views too.
                    Leave categories without a target until expectations are
                    agreed.
                  </p>
                  <button
                    className="btn btn--primary btn--sm"
                    disabled={busy}
                    onClick={() => mutate("POST")}
                  >
                    {busy ? "Working…" : "Collect watchlist now"}
                  </button>
                  <p>
                    Default tracking covers early check-ins and weekend
                    consequences. Add an exact Orah category below to include
                    another consequence type.
                  </p>
                  {targetRows.map((row, i) => (
                    <div className="an-target" key={i}>
                      <label>
                        Category
                        <input
                          list="an-categories"
                          value={row.category}
                          onChange={(e) =>
                            setTargetRows(
                              targetRows.map((r, j) =>
                                j === i
                                  ? { ...r, category: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Target hours
                        <input
                          type="number"
                          min="1"
                          max="8760"
                          value={row.hours}
                          onChange={(e) =>
                            setTargetRows(
                              targetRows.map((r, j) =>
                                j === i ? { ...r, hours: e.target.value } : r,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        onClick={() =>
                          setTargetRows(targetRows.filter((_, j) => j !== i))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <datalist id="an-categories">
                    {data.watch?.categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <div className="an-actions">
                    <button
                      onClick={() =>
                        setTargetRows([
                          ...targetRows,
                          { category: "", hours: "" },
                        ])
                      }
                    >
                      Add category target
                    </button>
                    <button disabled={busy} onClick={() => mutate("PUT")}>
                      Save targets
                    </button>
                  </div>
                  <p role="status">{status}</p>
                </details>
              )}
            </>
          )}
          {view === "warnings" && (
            <>
              <h2>Warnings & conversations</h2>
              <p className="an-muted">
                Week of {data.warnings?.week ?? "—"}, evaluated through{" "}
                {range.end}. Older outstanding conversations carry forward. This
                operational week is separate from the full-period pastoral
                totals.
              </p>
              <Search value={search} onChange={setSearch} />
              <DataTable
                headers={[
                  "Student",
                  "Dorm",
                  "Level",
                  "Warnings this week",
                  "Unaddressed",
                  "Follow-up",
                ]}
                rows={[...(data.warnings?.students ?? [])]
                  .sort(
                    (a, b) =>
                      Number(b.dueNow) - Number(a.dueNow) ||
                      b.effectiveLevel - a.effectiveLevel,
                  )
                  .filter(matches)
                  .map((s) => [
                    nameButton(s.studentId, s.name),
                    s.dorm,
                    s.effectiveLevel,
                    s.warningsThisWeek.length,
                    s.warningsSinceLastConversation,
                    s.dueNow
                      ? "Conversation due"
                      : s.conversation?.status === "done"
                        ? "Conversation logged"
                        : "Below threshold",
                  ])}
                empty="No matching warnings or outstanding conversations in the available data."
              />
              <Link
                className="btn btn--primary btn--sm an-no-print"
                href="/live"
              >
                Open Live → Warnings to log a conversation
              </Link>
            </>
          )}
          {view === "rest" && (
            <>
              <h2>Health Center & rest</h2>
              {data.rest?.now && (
                <div className="an-stats">
                  <Metric
                    label="In Health Center now"
                    value={data.rest.now.health}
                    sub="Current recorded location"
                  />
                  <Metric
                    label="Resting in room now"
                    value={data.rest.now.room}
                    sub="Separate from Health Center occupancy"
                  />
                </div>
              )}
              <div className="an-stats">
                <Metric
                  label="Students in selected period"
                  value={data.rest?.summary.students ?? "—"}
                />
                <Metric
                  label="Recorded visits"
                  value={data.rest?.summary.visits ?? "—"}
                />
                <Metric
                  label="Median completed visit"
                  value={
                    data.rest?.summary.medianMinutes == null
                      ? "—"
                      : `${Math.round(data.rest.summary.medianMinutes)} min`
                  }
                  sub={`${data.rest?.summary.paired ?? 0} paired visits`}
                />
                <Metric
                  label="Paired hours in period"
                  value={data.rest?.summary.totalHours.toFixed(1) ?? "—"}
                />
              </div>
              <p className="an-notice">
                Only matching check-in/check-out pairs contribute to duration
                KPIs. {data.rest?.summary.inferred ?? 0} departures inferred
                from location changes, {data.rest?.summary.ongoing ?? 0}{" "}
                ongoing, {data.rest?.summary.incomplete ?? 0} incomplete. These
                are recorded location intervals, not confirmed pass durations.
                History looks back 31 days before the selected window.
              </p>
              <Search value={search} onChange={setSearch} />
              {data.rest?.now && (
                <>
                  <h3>Currently recorded resting</h3>
                  <DataTable
                    headers={["Student", "Dorm", "Location type", "Since"]}
                    rows={data.rest.now.students
                      .filter(matches)
                      .map((s) => [
                        nameButton(s.studentId, s.name),
                        s.dorm,
                        s.kind === "health" ? "Health Center" : "Room rest",
                        stamp(s.since),
                      ])}
                  />
                </>
              )}
              <DataTable
                headers={[
                  "Student",
                  "Location",
                  "Start",
                  "End",
                  "Recorded minutes in period",
                  "Evidence",
                ]}
                rows={(data.rest?.visits ?? [])
                  .filter(matches)
                  .map((v) => [
                    nameButton(v.studentId, v.name),
                    v.location,
                    stamp(v.start),
                    v.end ? stamp(v.end) : "No end recorded",
                    v.minutes === null ? "—" : Math.round(v.minutes),
                    v.quality,
                  ])}
              />
            </>
          )}
          {view === "trends" && (
            <>
              <h2>Trends & dorm comparison</h2>
              <p className="an-muted">
                All non-sensitive pastoral categories. Rates use the current
                roster, including for historical records. Note volume reflects
                recording practices as well as student activity.
              </p>
              {data.pastoral && (
                <>
                  <div className="an-charts">
                    <Bars
                      title="Categories"
                      rows={data.pastoral.categories}
                      onSelect={(cat) =>
                        showRecords(cat, (r) => r.category === cat)
                      }
                    />
                    <Bars
                      title="Days in selected period"
                      rows={data.pastoral.days}
                      onSelect={(day) =>
                        showRecords(
                          day,
                          (r) => localDay(new Date(r.date)) === day,
                        )
                      }
                    />
                  </div>
                  <Bars
                    title="Eight-week context ending at cutoff (last week may be partial)"
                    rows={data.pastoral.weeks}
                    onSelect={(week) => {
                      const r = weekRange(new Date(`${week}T12:00:00Z`));
                      setRange({
                        start: localDay(r.start),
                        end: localDay(new Date(Math.min(+r.end, Date.now()))),
                      });
                    }}
                  />
                  <DataTable
                    headers={[
                      "Dorm",
                      "Records",
                      "Distinct students",
                      "Current roster",
                      "Records per 100 students",
                    ]}
                    rows={data.pastoral.dorms.map((d) => [
                      <button
                        className="an-link"
                        onClick={() =>
                          setDorm(
                            String(
                              houses.find((h) => h.name === d.label)?.id ?? "",
                            ),
                          )
                        }
                      >
                        {d.label}
                      </button>,
                      d.count,
                      d.students,
                      d.roster,
                      d.per100 ?? "—",
                    ])}
                  />
                  <p className="an-muted">
                    Select a category or day to inspect records. Select a week
                    to load that week. Select a dorm to focus all views.
                  </p>
                </>
              )}
            </>
          )}
          {(student !== null || drill) && (
            <section
              id="an-details"
              className="an-detail"
              aria-label="Selected records"
            >
              <div className="an-detail-head">
                <h2>{student !== null ? studentName : drill?.title}</h2>
                <button
                  onClick={() => {
                    setStudent(null);
                    setDrill(null);
                  }}
                >
                  Close details
                </button>
              </div>
              <DataTable
                headers={["Student", "Date", "Category", "Record"]}
                rows={records.map((r) => [
                  nameButton(r.studentId, r.name),
                  stamp(r.date),
                  r.category,
                  r.description,
                ])}
              />
              {student !== null && (
                <>
                  <h3>Recorded consequences</h3>
                  <DataTable
                    headers={["Category", "First observed", "Removal observed"]}
                    rows={episodes
                      .filter(
                        (e) =>
                          e.studentId === student &&
                          Date.parse(e.startBy) <= Date.parse(data.end),
                      )
                      .map((e) => [
                        e.category,
                        stamp(e.startBy),
                        e.endBy && Date.parse(e.endBy) <= Date.parse(data.end)
                          ? stamp(e.endBy)
                          : "Outstanding at cutoff",
                      ])}
                  />
                  <h3>Rest activity in this period</h3>
                  <DataTable
                    headers={["Location", "Start", "End", "Evidence"]}
                    rows={(data.rest?.visits ?? [])
                      .filter((v) => v.studentId === student)
                      .map((v) => [
                        v.location,
                        stamp(v.start),
                        stamp(v.end),
                        v.quality,
                      ])}
                  />
                  {data.warnings?.students
                    .filter((s) => s.studentId === student)
                    .map((s) => (
                      <div key={s.studentId}>
                        <h3>Warning follow-up · level {s.effectiveLevel}</h3>
                        <p>
                          {s.dueNow
                            ? "Conversation due"
                            : "No conversation currently due"}{" "}
                          · Last conversation: {stamp(s.lastConversationAt)}
                        </p>
                        {s.conversation?.response && (
                          <p>{s.conversation.response}</p>
                        )}
                      </div>
                    ))}
                  <Link href="/live">Open Live dashboard for follow-up</Link>
                </>
              )}
            </section>
          )}
        </>
      )}
      <footer className="an-muted">
        Confidential · {viewerEmail} · Current dorm membership is used
        throughout. Missing data is shown explicitly. Attendance imports are not
        required.
      </footer>
    </div>
  );
}
function Metric({
  label,
  value,
  sub,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <div className="an-metric">
      <div className="an-metric-label">{label}</div>
      {onClick ? (
        <button onClick={onClick}>
          {value} <span aria-hidden>↗</span>
        </button>
      ) : (
        <strong>{value}</strong>
      )}
      {sub && <small>{sub}</small>}
    </div>
  );
}
function Search({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="an-search an-no-print">
      Find a student
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Name or dorm"
      />
    </label>
  );
}
function Bars({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows: { label: string; count: number }[];
  onSelect: (label: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="an-panel">
      <h3>{title}</h3>
      {!rows.length ? (
        <p>No matching records.</p>
      ) : (
        rows.map((r) => (
          <button
            className="an-bar"
            key={r.label}
            onClick={() => onSelect(r.label)}
            aria-label={`${r.label}: ${r.count} records`}
          >
            <span>{r.label}</span>
            <span className="an-track">
              <i style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <strong>{r.count}</strong>
          </button>
        ))
      )}
    </section>
  );
}
function DataTable({
  headers,
  rows,
  empty = "No matching records.",
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(rows.length / 25);
  const current = Math.min(page, Math.max(0, pages - 1));
  return (
    <div className="an-table-wrap">
      {rows.length ? (
        <>
          <table className="an-table">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(current * 25, current * 25 + 25).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="an-pagination">
              <button disabled={!current} onClick={() => setPage(current - 1)}>
                Previous
              </button>
              <span>
                Page {current + 1} of {pages} · {rows.length} records · print
                includes this page
              </span>
              <button
                disabled={current === pages - 1}
                onClick={() => setPage(current + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="an-empty">{empty}</p>
      )}
    </div>
  );
}
