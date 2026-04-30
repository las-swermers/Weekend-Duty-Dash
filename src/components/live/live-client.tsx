"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import useSWR from "swr";

import { Icon, LASCrest } from "@/components/dashboard/icon";
import { Toast } from "@/components/dashboard/toast";
import type { PastoralEntry } from "@/components/shared/pastoral-row";
import { signOutAction } from "@/lib/auth-actions";
import type { CalendarEvent } from "@/lib/google-calendar";

interface Props {
  userName: string | null;
  todayCategories: string[];
  weekendCategories: string[];
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

interface DormNotesResponse {
  notes: DormNote[];
  configured: boolean;
  categoryName?: string;
}

interface ActivitiesResponse {
  events: CalendarEvent[];
  configured: boolean;
  error?: string;
}

type DrawerState =
  | { kind: "hc"; item: HCStudent }
  | { kind: "infraction"; item: PastoralEntry }
  | null;

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

const REFRESH_MS = 30_000;
const TZ = "Europe/Zurich";

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
};

function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function photoGradient(seed: string): string {
  const hue = hueFromString(seed);
  return `linear-gradient(160deg, hsl(${hue}, 38%, 32%) 0%, hsl(${(hue + 30) % 360}, 42%, 22%) 100%)`;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatCheckIn(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
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

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
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

type TabKey = "hc" | "today" | "weekend" | "activities";

interface Tab {
  key: TabKey;
  label: string;
  titleEm: string;
  sub: string;
  searchPlaceholder: string;
  unit: string;
}

const TABS: Tab[] = [
  {
    key: "hc",
    label: "Health",
    titleEm: "Center",
    sub: "currently in HC",
    searchPlaceholder: "Search students…",
    unit: "STUDENTS",
  },
  {
    key: "today",
    label: "Today's",
    titleEm: "Infractions",
    sub: "outstanding watchlist",
    searchPlaceholder: "Search infractions…",
    unit: "ENTRIES",
  },
  {
    key: "weekend",
    label: "Weekend",
    titleEm: "Infractions",
    sub: "outstanding watchlist",
    searchPlaceholder: "Search infractions…",
    unit: "ENTRIES",
  },
  {
    key: "activities",
    label: "Activities",
    titleEm: "Calendar",
    sub: "upcoming events",
    searchPlaceholder: "Search events…",
    unit: "EVENTS",
  },
];

function severity(n: number): "low" | "mid" | "high" {
  if (n === 0) return "low";
  if (n <= 2) return "mid";
  return "high";
}

// ─── Top bar ─────────────────────────────────────────────────────

function TopBar({
  userName,
  refreshing,
  onRefresh,
  asOf,
}: {
  userName: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  asOf: string;
}) {
  return (
    <header className="cr-bar">
      <div className="cr-bar__brand">
        <LASCrest size={28} />
        <div>
          <h1 className="cr-bar__title">
            Live <em>Duty</em>
          </h1>
          <div className="cr-bar__subtitle">
            Leysin American School · live snapshot
          </div>
        </div>
      </div>
      <div className="cr-bar__meta">
        <span className="cr-pill">
          <span className="cr-pill__live" /> Live · {asOf}
        </span>
        {userName && (
          <span>
            AOC · <strong>{userName}</strong>
          </span>
        )}
      </div>
      <div className="cr-bar__actions">
        <Link href="/weekend" className="btn btn--ghost btn--sm">
          <Icon name="folder" size={13} /> Weekend
        </Link>
        <Link href="/analytics" className="btn btn--ghost btn--sm">
          <Icon name="folder" size={13} /> Analytics
        </Link>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onRefresh}
          title="Refresh"
        >
          <Icon
            name="refresh"
            size={13}
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
  );
}

// ─── Last-night dorm-notes strip ─────────────────────────────────

function LastNightStrip({ data }: { data?: DormNotesResponse }) {
  if (!data?.configured) return null;
  const notes = data.notes ?? [];
  if (notes.length === 0) return null;
  return (
    <div className="cr-lastnight">
      <div className="cr-lastnight__label">
        <span className="cr-lastnight__dot" />
        Last <em>night</em>
        <span className="cr-lastnight__count">{notes.length} notes</span>
      </div>
      <div className="cr-lastnight__items">
        {notes.map((n) => (
          <div className="cr-lastnight__item" key={n.id}>
            <strong>{n.studentName}</strong>
            <span className="cr-lastnight__sep">·</span>
            <span className="cr-lastnight__dorm">{n.dorm}</span>
            {n.description && (
              <>
                <span className="cr-lastnight__sep">·</span>
                <span className="cr-lastnight__note">{n.description}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stats strip ─────────────────────────────────────────────────

function StatsStrip({
  active,
  onSelect,
  counts,
}: {
  active: TabKey;
  onSelect: (k: TabKey) => void;
  counts: Record<TabKey, number>;
}) {
  return (
    <div className="cr-stats" role="tablist">
      {TABS.map((t) => {
        const n = counts[t.key];
        const sev = severity(n);
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`cr-stat cr-stat--${sev}${isActive ? " is-active" : ""}`}
            onClick={() => onSelect(t.key)}
          >
            <span className="cr-stat__pip" />
            <div className="cr-stat__body">
              <div className="cr-stat__label">
                {t.label} {t.titleEm}
              </div>
              <div className="cr-stat__sub">{t.sub}</div>
            </div>
            <div className="cr-stat__num">{String(n).padStart(2, "0")}</div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Roster shell ────────────────────────────────────────────────

function RosterShell({
  active,
  query,
  setQuery,
  count,
  filterRow,
  children,
}: {
  active: TabKey;
  query: string;
  setQuery: (s: string) => void;
  count: number;
  filterRow?: ReactNode;
  children: ReactNode;
}) {
  const tab = TABS.find((t) => t.key === active)!;
  return (
    <div className="cr-roster">
      <div className="cr-roster__head">
        <div className="cr-roster__title-row">
          <h2 className="cr-roster__title">
            {tab.label} <em>{tab.titleEm}</em>
          </h2>
          <span className="cr-roster__count">
            {String(count).padStart(2, "0")} {tab.unit}
          </span>
        </div>
        <div className="cr-roster__filters">
          <div className="cr-search">
            <Icon name="search" size={13} />
            <input
              type="text"
              placeholder={tab.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {filterRow}
      </div>
      <div className="cr-roster__body">{children}</div>
    </div>
  );
}

// ─── HC tab ──────────────────────────────────────────────────────

function hcTagInfo(s: HCStudent): { label: string; cls: "in" | "out" | "rest" | "overnight" } {
  if (s.status === "discharged") {
    return { label: `Out ${formatTime(s.checkOutISO ?? new Date().toISOString())}`, cls: "out" };
  }
  if (s.isRestInRoom) return { label: "Rest pass", cls: "rest" };
  if (s.durationMinutes >= 720) return { label: "Overnight", cls: "overnight" };
  return { label: "In HC", cls: "in" };
}

function HCCard({
  s,
  onClick,
}: {
  s: HCStudent;
  onClick: (s: HCStudent) => void;
}) {
  const tag = hcTagInfo(s);
  const detail =
    s.isRestInRoom && s.roomNumber ? `Rest · Rm ${s.roomNumber}` : s.reason;
  return (
    <button
      type="button"
      className={`cr-card cr-card--${tag.cls}`}
      title={`${s.name} · ${s.dorm}`}
      onClick={() => onClick(s)}
    >
      <div
        className="cr-card__photo"
        style={{ background: photoGradient(s.name) }}
        aria-hidden
      >
        {s.initials}
      </div>
      <span className="cr-card__pip" aria-hidden />
      <div className="cr-card__body">
        <div className="cr-card__name">{s.name}</div>
        <div className="cr-card__meta">
          {formatCheckIn(s.checkInISO)} · {formatDuration(s.durationMinutes)}
        </div>
        <div className="cr-card__detail">{detail}</div>
        <span className={`cr-card__tag cr-card__tag--${tag.cls}`}>
          {tag.label}
        </span>
      </div>
    </button>
  );
}

function HCTab({
  students,
  onCardClick,
}: {
  students: HCStudent[];
  onCardClick: (s: HCStudent) => void;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, HCStudent[]>();
    for (const s of students) {
      const key = s.isRestInRoom ? "Rest in Room" : s.location || "—";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    for (const list of m.values()) {
      list.sort((a, b) => {
        if (a.status !== b.status) return a.status === "in" ? -1 : 1;
        return a.checkInISO.localeCompare(b.checkInISO);
      });
    }
    return m;
  }, [students]);

  const groupKeys = useMemo(
    () =>
      Array.from(grouped.keys()).sort((a, b) => {
        if (a === "Rest in Room") return 1;
        if (b === "Rest in Room") return -1;
        return a.localeCompare(b);
      }),
    [grouped],
  );

  if (students.length === 0) {
    return <div className="cr-empty">No HC students match.</div>;
  }

  return (
    <div className="cr-groups-cols">
      {groupKeys.map((key) => {
        const list = grouped.get(key) ?? [];
        const inNow = list.filter((s) => s.status === "in").length;
        return (
          <div key={key} className="cr-dorm-group">
            <div className="cr-dorm-group__head">
              <h3 className="cr-dorm-group__title">{key}</h3>
              <span className="cr-dorm-group__count">
                {list.length} · {inNow} in now
              </span>
            </div>
            <div className="cr-grid">
              {list.map((s) => (
                <HCCard key={s.id} s={s} onClick={onCardClick} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Infractions tab (category-grouped, dorm-chip filtered) ──────

function ServeCard({
  entry,
  onClick,
}: {
  entry: PastoralEntry;
  onClick: (e: PastoralEntry) => void;
}) {
  return (
    <button
      type="button"
      className="cr-serve-card"
      title={`${entry.studentName} · ${entry.category}`}
      onClick={() => onClick(entry)}
    >
      <div
        className="cr-serve-card__photo"
        style={{ background: photoGradient(entry.studentName) }}
        aria-hidden
      >
        {entry.studentInitials}
      </div>
      <div className="cr-serve-card__body">
        <div className="cr-serve-card__name">{entry.studentName}</div>
        <div className="cr-serve-card__sub">
          {entry.dorm} · {formatDate(entry.date)}
        </div>
        {entry.description && (
          <div className="cr-serve-card__desc">{entry.description}</div>
        )}
        <div className="cr-serve-card__by">By {entry.createdBy}</div>
      </div>
    </button>
  );
}

function DormChips({
  dorms,
  active,
  onSelect,
}: {
  dorms: string[];
  active: string;
  onSelect: (dorm: string) => void;
}) {
  if (dorms.length === 0) return null;
  return (
    <div className="cr-dorm-chips">
      <span className="cr-dorm-chips__label">Dorm</span>
      <button
        type="button"
        className={`cr-dorm-chip${active === "all" ? " is-on" : ""}`}
        onClick={() => onSelect("all")}
      >
        All
      </button>
      {dorms.map((d) => (
        <button
          key={d}
          type="button"
          className={`cr-dorm-chip${active === d ? " is-on" : ""}`}
          onClick={() => onSelect(d)}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

function InfractionsTab({
  records,
  categories,
  emptyMessage,
  onCardClick,
}: {
  records: PastoralEntry[];
  categories: string[];
  emptyMessage: string;
  onCardClick: (e: PastoralEntry) => void;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, PastoralEntry[]>();
    for (const cat of categories) m.set(cat, []);
    for (const r of records) {
      const matchKey = categories.find(
        (c) => c.toLowerCase() === r.category.toLowerCase(),
      );
      if (!matchKey) continue;
      m.get(matchKey)!.push(r);
    }
    for (const list of m.values()) {
      list.sort((a, b) => (a.date < b.date ? 1 : -1));
    }
    return m;
  }, [records, categories]);

  if (records.length === 0) {
    return <div className="cr-empty">{emptyMessage}</div>;
  }

  return (
    <div className="cr-serve cr-groups-cols">
      {categories.map((cat) => {
        const list = grouped.get(cat) ?? [];
        if (list.length === 0) return null;
        return (
          <div key={cat} className="cr-serve__group">
            <div className="cr-serve__group-head">
              <h3 className="cr-serve__group-title">{cat}</h3>
              <span className="cr-serve__group-count">
                {list.length} {list.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            <div className="cr-serve__group-body">
              {list.map((e) => (
                <ServeCard key={e.id} entry={e} onClick={onCardClick} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function uniqueDorms(records: PastoralEntry[]): string[] {
  const set = new Set<string>();
  for (const r of records) if (r.dorm) set.add(r.dorm);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function filterInfractions(
  records: PastoralEntry[],
  query: string,
  dorm: string,
): PastoralEntry[] {
  let out = records;
  if (dorm !== "all") out = out.filter((r) => r.dorm === dorm);
  const q = query.trim().toLowerCase();
  if (q) {
    out = out.filter((r) =>
      [r.studentName, r.dorm, r.category, r.description, r.createdBy]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }
  return out;
}

// ─── Activities tab ──────────────────────────────────────────────

function ActivitiesTab({
  events,
  configured,
  error,
}: {
  events: CalendarEvent[];
  configured: boolean;
  error?: string;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = dayKey(e.start);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return m;
  }, [events]);

  const dayKeys = useMemo(
    () => Array.from(groups.keys()).sort(),
    [groups],
  );

  if (!configured) {
    return (
      <div className="cr-empty">
        Calendar not configured. Set GOOGLE_CALENDAR_ID and share with the
        service account.
      </div>
    );
  }
  if (error) return <div className="cr-empty">Calendar error: {error}</div>;
  if (events.length === 0) {
    return <div className="cr-empty">No events scheduled.</div>;
  }

  return (
    <>
      {dayKeys.map((k) => {
        const list = groups.get(k) ?? [];
        return (
          <div key={k} className="cr-cal-day">
            <div className="cr-cal-day__head">
              {formatDate(list[0]!.start)}
            </div>
            {list.map((e) => (
              <div key={e.id} className="cr-cal-row">
                <div className="cr-cal-row__time">
                  {e.allDay
                    ? "All day"
                    : `${formatTime(e.start)}–${formatTime(e.end)}`}
                </div>
                <div>
                  <div className="cr-cal-row__title">{e.summary}</div>
                  {(e.location || e.description) && (
                    <div className="cr-cal-row__sub">
                      {e.location && <span>{e.location}</span>}
                      {e.location && e.description && " · "}
                      {e.description && <span>{e.description}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

// ─── Detail drawer ───────────────────────────────────────────────

function Drawer({
  state,
  onClose,
}: {
  state: DrawerState;
  onClose: () => void;
}) {
  if (!state) return null;

  let initials: string;
  let name: string;
  let metaLine: string;
  let fields: Array<[string, string]>;
  let hueSeed: string;

  if (state.kind === "hc") {
    const s = state.item;
    initials = s.initials;
    name = s.name;
    hueSeed = s.name;
    metaLine = `${s.dorm}${s.roomNumber ? ` · Rm ${s.roomNumber}` : ""}`;
    const tag = hcTagInfo(s);
    fields = [
      ["Dorm", s.dorm || "—"],
      ["Room", s.roomNumber ?? "—"],
      ["Location", s.location || "—"],
      ["Reason", s.reason || "—"],
      ["Checked in", formatCheckIn(s.checkInISO)],
      ["Duration", formatDuration(s.durationMinutes)],
      ["Status", tag.label],
    ];
  } else {
    const e = state.item;
    initials = e.studentInitials;
    name = e.studentName;
    hueSeed = e.studentName;
    metaLine = `${e.category} · ${e.dorm}`;
    fields = [
      ["Category", e.category],
      ["Dorm", e.dorm || "—"],
      ["Date", formatDateTime(e.date)],
      ["Description", e.description || "—"],
      ["Created by", e.createdBy || "—"],
    ];
  }

  return (
    <>
      <div className="cr-drawer-backdrop" onClick={onClose} />
      <aside className="cr-drawer" role="dialog" aria-label={name}>
        <div className="cr-drawer__head">
          <div
            className="cr-drawer__photo"
            style={{ background: photoGradient(hueSeed) }}
            aria-hidden
          >
            {initials}
          </div>
          <div>
            <h2 className="cr-drawer__name">{name}</h2>
            <div className="cr-drawer__meta">{metaLine}</div>
          </div>
          <button
            type="button"
            className="cr-drawer__close"
            onClick={onClose}
            aria-label="Close detail"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="cr-drawer__body">
          {fields.map(([k, v]) => (
            <div key={k} className="cr-drawer__field">
              <div className="cr-drawer__field-label">{k}</div>
              <div className="cr-drawer__field-value">{v}</div>
            </div>
          ))}
        </div>
        <div className="cr-drawer__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── Main component ──────────────────────────────────────────────

export function LiveClient(props: Props) {
  const [active, setActive] = useState<TabKey>("hc");
  const [query, setQuery] = useState("");
  const [todayDorm, setTodayDorm] = useState("all");
  const [weekendDorm, setWeekendDorm] = useState("all");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState<string>(() =>
    formatTime(new Date().toISOString()),
  );

  const hc = useSWR<{ students: HCStudent[] }>(
    "/api/orah/health-center-live",
    fetcher,
    { refreshInterval: REFRESH_MS },
  );

  const todayUrl = useMemo(() => {
    const params = new URLSearchParams({
      categories: props.todayCategories.join(","),
      watchlist: "1",
      limit: "200",
    });
    return `/api/orah/pastoral-by-category?${params.toString()}`;
  }, [props.todayCategories]);

  const todayInfractions = useSWR<{ records: PastoralEntry[] }>(
    props.todayCategories.length > 0 ? todayUrl : null,
    fetcher,
    { refreshInterval: REFRESH_MS },
  );

  const weekendUrl = useMemo(() => {
    const params = new URLSearchParams({
      categories: props.weekendCategories.join(","),
      watchlist: "1",
      limit: "200",
    });
    return `/api/orah/pastoral-by-category?${params.toString()}`;
  }, [props.weekendCategories]);

  const weekendInfractions = useSWR<{ records: PastoralEntry[] }>(
    props.weekendCategories.length > 0 ? weekendUrl : null,
    fetcher,
    { refreshInterval: REFRESH_MS },
  );

  const dormNotes = useSWR<DormNotesResponse>(
    "/api/orah/dorm-notes",
    fetcher,
    { refreshInterval: REFRESH_MS },
  );

  const activities = useSWR<ActivitiesResponse>(
    "/api/calendar/events?days=3",
    fetcher,
    { refreshInterval: 5 * 60_000 },
  );

  useEffect(() => {
    const id = setInterval(
      () => setNow(formatTime(new Date().toISOString())),
      30_000,
    );
    return () => clearInterval(id);
  }, []);

  // Reset search when switching tabs.
  useEffect(() => {
    setQuery("");
  }, [active]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      hc.mutate(),
      todayInfractions.mutate(),
      weekendInfractions.mutate(),
      dormNotes.mutate(),
      activities.mutate(),
    ]);
    setRefreshing(false);
    setToast("Refreshed");
    window.setTimeout(() => setToast(null), 2000);
  }, [hc, todayInfractions, weekendInfractions, dormNotes, activities]);

  const allStudents = hc.data?.students ?? [];
  const hcInNow = allStudents.filter((s) => s.status === "in").length;

  const filteredStudents = useMemo(() => {
    if (active !== "hc" || !query.trim()) return allStudents;
    const q = query.toLowerCase();
    return allStudents.filter((s) =>
      [s.name, s.dorm, s.location, s.reason, s.roomNumber]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [active, allStudents, query]);

  const todayRecords = todayInfractions.data?.records ?? [];
  const todayDorms = useMemo(() => uniqueDorms(todayRecords), [todayRecords]);
  const todayFiltered = useMemo(
    () => filterInfractions(todayRecords, query, todayDorm),
    [todayRecords, query, todayDorm],
  );

  const weekendRecords = weekendInfractions.data?.records ?? [];
  const weekendDorms = useMemo(
    () => uniqueDorms(weekendRecords),
    [weekendRecords],
  );
  const weekendFiltered = useMemo(
    () => filterInfractions(weekendRecords, query, weekendDorm),
    [weekendRecords, query, weekendDorm],
  );

  const events = activities.data?.events ?? [];
  const filteredEvents = useMemo(() => {
    if (active !== "activities" || !query.trim()) return events;
    const q = query.toLowerCase();
    return events.filter((e) =>
      [e.summary, e.location, e.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [active, events, query]);

  const counts: Record<TabKey, number> = {
    hc: hcInNow,
    today: todayRecords.length,
    weekend: weekendRecords.length,
    activities: events.length,
  };

  const rosterCount =
    active === "hc"
      ? filteredStudents.length
      : active === "today"
        ? todayFiltered.length
        : active === "weekend"
          ? weekendFiltered.length
          : active === "activities"
            ? filteredEvents.length
            : 0;

  return (
    <div className="cr" data-density="balanced">
      <TopBar
        userName={props.userName}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        asOf={now}
      />
      <LastNightStrip data={dormNotes.data} />
      <StatsStrip active={active} onSelect={setActive} counts={counts} />
      <div className="cr-main">
        <RosterShell
          active={active}
          query={query}
          setQuery={setQuery}
          count={rosterCount}
          filterRow={
            active === "today" ? (
              <DormChips
                dorms={todayDorms}
                active={todayDorm}
                onSelect={setTodayDorm}
              />
            ) : active === "weekend" ? (
              <DormChips
                dorms={weekendDorms}
                active={weekendDorm}
                onSelect={setWeekendDorm}
              />
            ) : null
          }
        >
          {active === "hc" ? (
            !hc.data ? (
              <div className="cr-empty">Loading…</div>
            ) : (
              <HCTab
                students={filteredStudents}
                onCardClick={(s) => setDrawer({ kind: "hc", item: s })}
              />
            )
          ) : active === "today" ? (
            !todayInfractions.data ? (
              <div className="cr-empty">Loading…</div>
            ) : props.todayCategories.length === 0 ? (
              <div className="cr-empty">No categories configured for today.</div>
            ) : (
              <InfractionsTab
                records={todayFiltered}
                categories={props.todayCategories}
                emptyMessage="No outstanding infractions to serve today."
                onCardClick={(e) => setDrawer({ kind: "infraction", item: e })}
              />
            )
          ) : active === "weekend" ? (
            !weekendInfractions.data ? (
              <div className="cr-empty">Loading…</div>
            ) : props.weekendCategories.length === 0 ? (
              <div className="cr-empty">No weekend categories configured.</div>
            ) : (
              <InfractionsTab
                records={weekendFiltered}
                categories={props.weekendCategories}
                emptyMessage="No outstanding weekend infractions."
                onCardClick={(e) => setDrawer({ kind: "infraction", item: e })}
              />
            )
          ) : !activities.data ? (
            <div className="cr-empty">Loading…</div>
          ) : (
            <ActivitiesTab
              events={filteredEvents}
              configured={activities.data.configured}
              error={activities.data.error}
            />
          )}
        </RosterShell>
      </div>

      <Drawer state={drawer} onClose={() => setDrawer(null)} />
      <Toast message={toast} />
    </div>
  );
}
