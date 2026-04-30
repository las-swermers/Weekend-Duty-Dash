"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import useSWR from "swr";

import {
  AddLinkDialog,
  type AddLinkDraft,
  type EditLinkDraft,
} from "@/components/dashboard/add-link-dialog";
import { Icon, LASCrest } from "@/components/dashboard/icon";
import { Launchpad } from "@/components/dashboard/launchpad";
import { Toast } from "@/components/dashboard/toast";
import type {
  PastoralEntry,
  ServedEntry,
} from "@/components/shared/pastoral-row";
import { signOutAction } from "@/lib/auth-actions";
import type { CalendarEvent } from "@/lib/google-calendar";
import type { HCStudent, NoPaStudent } from "@/lib/mock";
import type { Resource } from "@/types/resource";

interface Props {
  weekendLabel: string;
  aoc: string;
  userName: string | null;
  weekendRange: { startISO: string; endISO: string };
  initial: {
    hc: HCStudent[];
    noPa: NoPaStudent[];
    resources: Resource[];
  };
}

const REFRESH_MS = 60_000;
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

type TabKey = "byDorm" | "hc" | "noPa" | "weekendInfractions" | "activities";

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
    key: "byDorm",
    label: "Dorm",
    titleEm: "Overview",
    sub: "your dorm at a glance",
    searchPlaceholder: "Search this dorm…",
    unit: "ITEMS",
  },
  {
    key: "hc",
    label: "Health",
    titleEm: "Center",
    sub: "this weekend",
    searchPlaceholder: "Search students…",
    unit: "STUDENTS",
  },
  {
    key: "noPa",
    label: "No",
    titleEm: "Phys. Activity",
    sub: "active medical restrictions",
    searchPlaceholder: "Search restrictions…",
    unit: "FLAGS",
  },
  {
    key: "weekendInfractions",
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
    sub: "trips and events",
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
  weekendLabel,
  aoc,
  userName,
  refreshing,
  onRefresh,
  lastUpdated,
}: {
  weekendLabel: string;
  aoc: string;
  userName: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  lastUpdated: string;
}) {
  return (
    <header className="cr-bar">
      <div className="cr-bar__brand">
        <LASCrest size={28} />
        <div>
          <h1 className="cr-bar__title">
            Weekend <em>Duty</em>
          </h1>
          <div className="cr-bar__subtitle">{weekendLabel}</div>
        </div>
      </div>
      <div className="cr-bar__meta">
        <span className="cr-pill">
          <span className="cr-pill__live" /> Updated {lastUpdated}
        </span>
        {aoc && aoc !== "TBD" && (
          <span>
            AOC · <strong>{aoc}</strong>
          </span>
        )}
        {userName && <span>{userName}</span>}
      </div>
      <div className="cr-bar__actions">
        <Link href="/live" className="btn btn--ghost btn--sm">
          <Icon name="folder" size={13} /> Live
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

// ─── Stats strip ─────────────────────────────────────────────────

function StatsStrip({
  active,
  onSelect,
  counts,
  byDormLabel,
}: {
  active: TabKey;
  onSelect: (k: TabKey) => void;
  counts: Record<TabKey, number>;
  byDormLabel: string;
}) {
  return (
    <div className="cr-stats" role="tablist">
      {TABS.map((t) => {
        const n = counts[t.key];
        const sev = severity(n);
        const isActive = active === t.key;
        const sub = t.key === "byDorm" && byDormLabel ? byDormLabel : t.sub;
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
              <div className="cr-stat__sub">{sub}</div>
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
  toolbarExtras,
  children,
}: {
  active: TabKey;
  query: string;
  setQuery: (s: string) => void;
  count: number;
  filterRow?: ReactNode;
  toolbarExtras?: ReactNode;
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
          {toolbarExtras}
        </div>
        {filterRow}
      </div>
      <div className="cr-roster__body">{children}</div>
    </div>
  );
}

// ─── HC tab ──────────────────────────────────────────────────────

function hcTagInfo(s: HCStudent): { label: string; cls: "in" | "overnight" } {
  if (s.status === "overnight") return { label: "Overnight", cls: "overnight" };
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
  const name = s.name ?? s.initials;
  return (
    <button
      type="button"
      className={`cr-card cr-card--${tag.cls}`}
      title={`${name} · ${s.dorm}`}
      onClick={() => onClick(s)}
    >
      <div
        className="cr-card__photo"
        style={{ background: photoGradient(name) }}
        aria-hidden
      >
        {s.initials}
      </div>
      <span className="cr-card__pip" aria-hidden />
      <div className="cr-card__body">
        <div className="cr-card__name">{name}</div>
        <div className="cr-card__meta">
          {s.dorm}
          {s.location ? ` · ${s.location}` : ""}
        </div>
        <div className="cr-card__detail">{s.reason}</div>
        <span className={`cr-card__tag cr-card__tag--${tag.cls}`}>
          since {s.since} · {tag.label}
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
      const key = s.location || "Health Center";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    for (const list of m.values()) {
      list.sort((a, b) => {
        if (a.status !== b.status) return a.status === "overnight" ? -1 : 1;
        return (a.name ?? a.initials).localeCompare(b.name ?? b.initials);
      });
    }
    return m;
  }, [students]);

  const groupKeys = useMemo(
    () => Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b)),
    [grouped],
  );

  if (students.length === 0) {
    return <div className="cr-empty">No HC students this weekend.</div>;
  }

  return (
    <div className="cr-groups-cols">
      {groupKeys.map((key) => {
        const list = grouped.get(key) ?? [];
        const overnight = list.filter((s) => s.status === "overnight").length;
        return (
          <div key={key} className="cr-dorm-group">
            <div className="cr-dorm-group__head">
              <h3 className="cr-dorm-group__title">{key}</h3>
              <span className="cr-dorm-group__count">
                {list.length}
                {overnight > 0 ? ` · ${overnight} overnight` : ""}
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

// ─── No Phys. Activity tab ───────────────────────────────────────

function NoPaCard({
  s,
  onClick,
}: {
  s: NoPaStudent;
  onClick: (s: NoPaStudent) => void;
}) {
  const name = s.name ?? s.initials;
  return (
    <button
      type="button"
      className="cr-card cr-card--rest"
      title={`${name} · ${s.dorm}`}
      onClick={() => onClick(s)}
    >
      <div
        className="cr-card__photo"
        style={{ background: photoGradient(name) }}
        aria-hidden
      >
        {s.initials}
      </div>
      <span className="cr-card__pip" aria-hidden />
      <div className="cr-card__body">
        <div className="cr-card__name">{name}</div>
        <div className="cr-card__meta">{s.dorm}</div>
        <div className="cr-card__detail">{s.restriction}</div>
        <span className="cr-card__tag cr-card__tag--rest">
          {s.until === "ongoing" ? "Ongoing" : `Until ${s.until}`}
        </span>
      </div>
    </button>
  );
}

function NoPaTab({
  students,
  onCardClick,
}: {
  students: NoPaStudent[];
  onCardClick: (s: NoPaStudent) => void;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, NoPaStudent[]>();
    for (const s of students) {
      const key = s.dorm || "—";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    for (const list of m.values()) {
      list.sort((a, b) =>
        (a.name ?? a.initials).localeCompare(b.name ?? b.initials),
      );
    }
    return m;
  }, [students]);

  const groupKeys = useMemo(
    () => Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b)),
    [grouped],
  );

  if (students.length === 0) {
    return <div className="cr-empty">No active no-PA flags.</div>;
  }
  return (
    <div className="cr-groups-cols">
      {groupKeys.map((dorm) => {
        const list = grouped.get(dorm) ?? [];
        return (
          <div key={dorm} className="cr-dorm-group">
            <div className="cr-dorm-group__head">
              <h3 className="cr-dorm-group__title">{dorm}</h3>
              <span className="cr-dorm-group__count">{list.length}</span>
            </div>
            <div className="cr-grid">
              {list.map((s) => (
                <NoPaCard key={s.id} s={s} onClick={onCardClick} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Weekend Infractions tab ─────────────────────────────────────

const WEEKEND_INFRACTION_CATEGORIES = [
  "Saturday Clipboard",
  "Sunday Clipboard",
  "Friday Night in the Dorm",
  "Saturday Night in the Dorm",
  "1-hour early check-in",
  "2-hour early check-in",
];

function ServeCard({
  entry,
  onClick,
  served,
  onToggleServed,
}: {
  entry: PastoralEntry;
  onClick: (e: PastoralEntry) => void;
  served?: ServedEntry;
  onToggleServed?: (entry: PastoralEntry, currentlyServed: boolean) => void;
}) {
  const isServed = Boolean(served);
  const showCheck = Boolean(onToggleServed);
  return (
    <div
      className={`cr-serve-card${showCheck ? " cr-serve-card--has-check" : ""}${isServed ? " cr-serve-card--served" : ""}`}
    >
      {showCheck && (
        <label
          className="cr-serve-card__check"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isServed}
            onChange={() => onToggleServed?.(entry, isServed)}
            aria-label={`Mark ${entry.studentName} as ${isServed ? "not served" : "served"}`}
          />
        </label>
      )}
      <button
        type="button"
        className="cr-serve-card__photo"
        style={{ background: photoGradient(entry.studentName) }}
        aria-label={`Open details for ${entry.studentName}`}
        onClick={() => onClick(entry)}
      >
        {entry.studentInitials}
      </button>
      <button
        type="button"
        className="cr-serve-card__body"
        onClick={() => onClick(entry)}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          textAlign: "left",
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        <div className="cr-serve-card__name">{entry.studentName}</div>
        <div className="cr-serve-card__sub">
          {entry.dorm} · {formatDate(entry.date)}
        </div>
        {entry.description && (
          <div className="cr-serve-card__desc">{entry.description}</div>
        )}
        <div className="cr-serve-card__by">By {entry.createdBy}</div>
        {isServed && served && (
          <div className="cr-serve-card__served-meta">
            ✓ Served by {served.servedBy.split("@")[0]}
          </div>
        )}
      </button>
    </div>
  );
}

function DormChips({
  dorms,
  active,
  onSelect,
  hideAll = false,
  label = "Dorm",
}: {
  dorms: string[];
  active: string;
  onSelect: (dorm: string) => void;
  hideAll?: boolean;
  label?: string;
}) {
  if (dorms.length === 0) return null;
  return (
    <div className="cr-dorm-chips">
      <span className="cr-dorm-chips__label">{label}</span>
      {!hideAll && (
        <button
          type="button"
          className={`cr-dorm-chip${active === "all" ? " is-on" : ""}`}
          onClick={() => onSelect("all")}
        >
          All
        </button>
      )}
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

function InfractionsTab({
  records,
  categories,
  emptyMessage,
  onCardClick,
  servedMap,
  onToggleServed,
}: {
  records: PastoralEntry[];
  categories: string[];
  emptyMessage: string;
  onCardClick: (e: PastoralEntry) => void;
  servedMap?: Map<number, ServedEntry>;
  onToggleServed?: (entry: PastoralEntry, currentlyServed: boolean) => void;
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
                <ServeCard
                  key={e.id}
                  entry={e}
                  onClick={onCardClick}
                  served={servedMap?.get(e.id)}
                  onToggleServed={onToggleServed}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── By Dorm tab ─────────────────────────────────────────────────

function ByDormTab({
  dorm,
  hcStudents,
  noPaStudents,
  weekendRecords,
  servedMap,
  onHcClick,
  onNoPaClick,
  onInfClick,
  onToggleServed,
}: {
  dorm: string;
  hcStudents: HCStudent[];
  noPaStudents: NoPaStudent[];
  weekendRecords: PastoralEntry[];
  servedMap: Map<number, ServedEntry>;
  onHcClick: (s: HCStudent) => void;
  onNoPaClick: (s: NoPaStudent) => void;
  onInfClick: (e: PastoralEntry) => void;
  onToggleServed: (entry: PastoralEntry, currentlyServed: boolean) => void;
}) {
  if (!dorm) {
    return <div className="cr-empty">Pick a dorm above to view its roster.</div>;
  }
  const total =
    hcStudents.length + noPaStudents.length + weekendRecords.length;
  if (total === 0) {
    return <div className="cr-empty">Nothing flagged for {dorm}.</div>;
  }
  const overnight = hcStudents.filter((s) => s.status === "overnight").length;
  return (
    <div className="cr-groups-cols">
      <div className="cr-dorm-group">
        <div className="cr-dorm-group__head">
          <h3 className="cr-dorm-group__title">Health Center</h3>
          <span className="cr-dorm-group__count">
            {hcStudents.length}
            {overnight > 0 ? ` · ${overnight} overnight` : ""}
          </span>
        </div>
        {hcStudents.length === 0 ? (
          <div className="cr-empty">None</div>
        ) : (
          <div className="cr-grid">
            {hcStudents.map((s) => (
              <HCCard key={s.id} s={s} onClick={onHcClick} />
            ))}
          </div>
        )}
      </div>

      <div className="cr-dorm-group">
        <div className="cr-dorm-group__head">
          <h3 className="cr-dorm-group__title">No Phys. Activity</h3>
          <span className="cr-dorm-group__count">{noPaStudents.length}</span>
        </div>
        {noPaStudents.length === 0 ? (
          <div className="cr-empty">None</div>
        ) : (
          <div className="cr-grid">
            {noPaStudents.map((s) => (
              <NoPaCard key={s.id} s={s} onClick={onNoPaClick} />
            ))}
          </div>
        )}
      </div>

      <div className="cr-dorm-group">
        <div className="cr-dorm-group__head">
          <h3 className="cr-dorm-group__title">Weekend Infractions</h3>
          <span className="cr-dorm-group__count">
            {weekendRecords.length}{" "}
            {weekendRecords.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        {weekendRecords.length === 0 ? (
          <div className="cr-empty">None</div>
        ) : (
          <div className="cr-serve__group-body">
            {weekendRecords.map((e) => (
              <ServeCard
                key={e.id}
                entry={e}
                onClick={onInfClick}
                served={servedMap.get(e.id)}
                onToggleServed={onToggleServed}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activities tab ──────────────────────────────────────────────

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

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

  const dayKeys = useMemo(() => Array.from(groups.keys()).sort(), [groups]);

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
    return <div className="cr-empty">No events scheduled this weekend.</div>;
  }

  return (
    <>
      {dayKeys.map((k) => {
        const list = groups.get(k) ?? [];
        return (
          <div key={k} className="cr-cal-day">
            <div className="cr-cal-day__head">{formatDate(list[0]!.start)}</div>
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

type DrawerState =
  | { kind: "hc"; item: HCStudent }
  | { kind: "noPa"; item: NoPaStudent }
  | { kind: "infraction"; item: PastoralEntry }
  | null;

function Drawer({
  state,
  onClose,
}: {
  state: DrawerState;
  onClose: () => void;
}) {
  if (!state) return null;

  let name: string;
  let initials: string;
  let metaLine: string;
  let fields: Array<[string, string]>;
  let hueSeed: string;

  if (state.kind === "hc") {
    const s = state.item;
    name = s.name ?? s.initials;
    initials = s.initials;
    hueSeed = name;
    metaLine = s.dorm;
    const tag = hcTagInfo(s);
    fields = [
      ["Dorm", s.dorm || "—"],
      ["Location", s.location || "Health Center"],
      ["Reason", s.reason || "—"],
      ["Since", s.since],
      ["Status", tag.label],
    ];
  } else if (state.kind === "noPa") {
    const s = state.item;
    name = s.name ?? s.initials;
    initials = s.initials;
    hueSeed = name;
    metaLine = s.dorm;
    fields = [
      ["Dorm", s.dorm || "—"],
      ["Restriction", s.restriction || "—"],
      ["Until", s.until],
    ];
  } else {
    const e = state.item;
    name = e.studentName;
    initials = e.studentInitials;
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

export function DashboardClient({
  weekendLabel,
  aoc,
  userName,
  weekendRange,
  initial,
}: Props) {
  const [active, setActive] = useState<TabKey>("byDorm");
  const [query, setQuery] = useState("");
  const [weekendDorm, setWeekendDorm] = useState("all");
  const [byDorm, setByDorm] = useState<string>("");
  const [drawer, setDrawer] = useState<DrawerState>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("weekend.byDorm");
    if (stored) setByDorm(stored);
  }, []);

  const updateByDorm = useCallback((next: string) => {
    setByDorm(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("weekend.byDorm", next);
    }
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("just now");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Resource | null>(null);

  const hc = useSWR<{ students: HCStudent[] }>(
    "/api/orah/health-center",
    fetcher,
    { refreshInterval: REFRESH_MS, fallbackData: { students: initial.hc } },
  );
  const noPa = useSWR<{ students: NoPaStudent[] }>(
    "/api/orah/no-pa",
    fetcher,
    { refreshInterval: REFRESH_MS, fallbackData: { students: initial.noPa } },
  );
  const weekendInfractionsUrl = useMemo(() => {
    const params = new URLSearchParams({
      categories: WEEKEND_INFRACTION_CATEGORIES.join(","),
      watchlist: "1",
      limit: "200",
    });
    return `/api/orah/pastoral-by-category?${params.toString()}`;
  }, []);
  const weekendInfractions = useSWR<{ records: PastoralEntry[] }>(
    weekendInfractionsUrl,
    fetcher,
    { refreshInterval: REFRESH_MS },
  );

  const tickBucket = weekendRange.startISO;
  const servedSwr = useSWR<{ served: ServedEntry[] }>(
    `/api/clipboard?weekend=${encodeURIComponent(tickBucket)}`,
    fetcher,
    { refreshInterval: REFRESH_MS },
  );

  const activitiesUrl = useMemo(() => {
    const params = new URLSearchParams({
      start: weekendRange.startISO,
      end: weekendRange.endISO,
    });
    return `/api/calendar/events?${params.toString()}`;
  }, [weekendRange.startISO, weekendRange.endISO]);
  const activities = useSWR<{
    events: CalendarEvent[];
    configured: boolean;
    error?: string;
  }>(activitiesUrl, fetcher, { refreshInterval: 5 * 60_000 });

  const resources = useSWR<{
    resources: Resource[];
    mode?: "kv" | "sheet" | "seed" | "fallback";
    editUrl?: string | null;
    canAdd?: boolean;
  }>("/api/resources", fetcher, {
    fallbackData: { resources: initial.resources },
  });

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      const mins = Math.floor((Date.now() - startedAt) / 60_000);
      setLastUpdated(mins === 0 ? "just now" : `${mins}m ago`);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setQuery("");
  }, [active]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      hc.mutate(),
      noPa.mutate(),
      weekendInfractions.mutate(),
      servedSwr.mutate(),
      activities.mutate(),
      resources.mutate(),
    ]);
    setLastUpdated("just now");
    setRefreshing(false);
    showToast("Dashboard refreshed");
  }, [
    hc,
    noPa,
    weekendInfractions,
    servedSwr,
    activities,
    resources,
    showToast,
  ]);

  const servedMap = useMemo(() => {
    const m = new Map<number, ServedEntry>();
    for (const s of servedSwr.data?.served ?? []) m.set(s.recordId, s);
    return m;
  }, [servedSwr.data]);

  const handleToggleServed = useCallback(
    async (entry: PastoralEntry, currentlyServed: boolean) => {
      const next: ServedEntry[] = (servedSwr.data?.served ?? []).filter(
        (s) => s.recordId !== entry.id,
      );
      if (!currentlyServed) {
        next.push({
          recordId: entry.id,
          servedBy: "you",
          servedAt: new Date().toISOString(),
        });
      }
      void servedSwr.mutate({ served: next }, { revalidate: false });
      const method = currentlyServed ? "DELETE" : "POST";
      try {
        const res = await fetch("/api/clipboard", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordId: entry.id,
            weekend: tickBucket,
            studentName: entry.studentName,
            dorm: entry.dorm,
            category: entry.category,
            recordDate: entry.date,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : "Could not update served state",
        );
      }
      void servedSwr.mutate();
    },
    [servedSwr, tickBucket, showToast],
  );

  const handleAddSave = useCallback(
    async (draft: AddLinkDraft | EditLinkDraft) => {
      const isEdit = "originalName" in draft;
      const res = await fetch("/api/resources", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      await resources.mutate();
      if (isEdit) {
        setEditTarget(null);
        showToast(`Updated “${draft.name}”`);
      } else {
        setDialogOpen(false);
        showToast(`Added “${draft.name}”`);
      }
    },
    [resources, showToast],
  );

  const handleRemove = useCallback(
    async (resource: Resource) => {
      if (!window.confirm(`Remove “${resource.name}” from the launchpad?`)) {
        return;
      }
      try {
        const res = await fetch("/api/resources", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: resource.name, url: resource.url }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        await resources.mutate();
        showToast(`Removed “${resource.name}”`);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Failed to remove tile",
        );
      }
    },
    [resources, showToast],
  );

  const allStudents = hc.data?.students ?? [];
  const noPaStudents = noPa.data?.students ?? [];
  const weekendRecords = weekendInfractions.data?.records ?? [];

  const filteredStudents = useMemo(() => {
    if (active !== "hc" || !query.trim()) return allStudents;
    const q = query.toLowerCase();
    return allStudents.filter((s) =>
      [s.name, s.initials, s.dorm, s.location, s.reason]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [active, allStudents, query]);

  const filteredNoPa = useMemo(() => {
    if (active !== "noPa" || !query.trim()) return noPaStudents;
    const q = query.toLowerCase();
    return noPaStudents.filter((s) =>
      [s.name, s.initials, s.dorm, s.restriction, s.until]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [active, noPaStudents, query]);

  const weekendDorms = useMemo(
    () => uniqueDorms(weekendRecords),
    [weekendRecords],
  );
  const weekendFiltered = useMemo(
    () => filterInfractions(weekendRecords, query, weekendDorm),
    [weekendRecords, query, weekendDorm],
  );

  const allDorms = useMemo(() => {
    const set = new Set<string>();
    for (const s of allStudents) if (s.dorm) set.add(s.dorm);
    for (const s of noPaStudents) if (s.dorm) set.add(s.dorm);
    for (const r of weekendRecords) if (r.dorm) set.add(r.dorm);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allStudents, noPaStudents, weekendRecords]);

  const effectiveByDorm = byDorm || allDorms[0] || "";

  const byDormHc = useMemo(() => {
    if (!effectiveByDorm) return [];
    let list = allStudents.filter((s) => s.dorm === effectiveByDorm);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        [s.name, s.initials, s.location, s.reason]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return list;
  }, [allStudents, effectiveByDorm, query]);

  const byDormNoPa = useMemo(() => {
    if (!effectiveByDorm) return [];
    let list = noPaStudents.filter((s) => s.dorm === effectiveByDorm);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        [s.name, s.initials, s.restriction, s.until]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return list;
  }, [noPaStudents, effectiveByDorm, query]);

  const byDormWeekend = useMemo(
    () => filterInfractions(weekendRecords, query, effectiveByDorm),
    [weekendRecords, query, effectiveByDorm],
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

  const byDormStatCount =
    byDormHc.length + byDormNoPa.length + byDormWeekend.length;

  const counts: Record<TabKey, number> = {
    byDorm: byDormStatCount,
    hc: allStudents.length,
    noPa: noPaStudents.length,
    weekendInfractions: weekendRecords.length,
    activities: events.length,
  };

  const rosterCount =
    active === "byDorm"
      ? byDormStatCount
      : active === "hc"
        ? filteredStudents.length
        : active === "noPa"
          ? filteredNoPa.length
          : active === "weekendInfractions"
            ? weekendFiltered.length
            : active === "activities"
              ? filteredEvents.length
              : 0;

  return (
    <div className="cr" data-density="balanced">
      <TopBar
        weekendLabel={weekendLabel}
        aoc={aoc}
        userName={userName}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        lastUpdated={lastUpdated}
      />
      <div /> {/* spacer slot — used by Last Night strip on /live; empty here */}
      <StatsStrip
        active={active}
        onSelect={setActive}
        counts={counts}
        byDormLabel={effectiveByDorm}
      />
      <div className="cr-main cr-main--with-aside">
        <RosterShell
          active={active}
          query={query}
          setQuery={setQuery}
          count={rosterCount}
          filterRow={
            active === "weekendInfractions" ? (
              <DormChips
                dorms={weekendDorms}
                active={weekendDorm}
                onSelect={setWeekendDorm}
              />
            ) : active === "byDorm" ? (
              <DormChips
                dorms={allDorms}
                active={effectiveByDorm}
                onSelect={updateByDorm}
                hideAll
                label="Pick dorm"
              />
            ) : null
          }
        >
          {active === "byDorm" ? (
            !hc.data || !noPa.data || !weekendInfractions.data ? (
              <div className="cr-empty">Loading…</div>
            ) : (
              <ByDormTab
                dorm={effectiveByDorm}
                hcStudents={byDormHc}
                noPaStudents={byDormNoPa}
                weekendRecords={byDormWeekend}
                servedMap={servedMap}
                onHcClick={(s) => setDrawer({ kind: "hc", item: s })}
                onNoPaClick={(s) => setDrawer({ kind: "noPa", item: s })}
                onInfClick={(e) => setDrawer({ kind: "infraction", item: e })}
                onToggleServed={handleToggleServed}
              />
            )
          ) : active === "hc" ? (
            !hc.data ? (
              <div className="cr-empty">Loading…</div>
            ) : (
              <HCTab
                students={filteredStudents}
                onCardClick={(s) => setDrawer({ kind: "hc", item: s })}
              />
            )
          ) : active === "noPa" ? (
            !noPa.data ? (
              <div className="cr-empty">Loading…</div>
            ) : (
              <NoPaTab
                students={filteredNoPa}
                onCardClick={(s) => setDrawer({ kind: "noPa", item: s })}
              />
            )
          ) : active === "weekendInfractions" ? (
            !weekendInfractions.data ? (
              <div className="cr-empty">Loading…</div>
            ) : (
              <InfractionsTab
                records={weekendFiltered}
                categories={WEEKEND_INFRACTION_CATEGORIES}
                emptyMessage="No outstanding weekend infractions."
                onCardClick={(e) => setDrawer({ kind: "infraction", item: e })}
                servedMap={servedMap}
                onToggleServed={handleToggleServed}
              />
            )
          ) : active === "activities" ? (
            !activities.data ? (
              <div className="cr-empty">Loading…</div>
            ) : (
              <ActivitiesTab
                events={filteredEvents}
                configured={activities.data.configured}
                error={activities.data.error}
              />
            )
          ) : (
            <div className="cr-empty">
              Coming next — wiring in the next chunk.
            </div>
          )}
        </RosterShell>
        <aside className="cr-aside">
          <Launchpad
            resources={resources.data?.resources ?? []}
            mode={resources.data?.mode ?? "kv"}
            editUrl={resources.data?.editUrl ?? null}
            canAdd={resources.data?.canAdd ?? false}
            onAdd={() => setDialogOpen(true)}
            onRemove={handleRemove}
            onEdit={(r) => setEditTarget(r)}
          />
        </aside>
      </div>

      <Drawer state={drawer} onClose={() => setDrawer(null)} />

      <AddLinkDialog
        open={dialogOpen}
        mode="add"
        onClose={() => setDialogOpen(false)}
        onSave={handleAddSave}
      />
      <AddLinkDialog
        open={editTarget !== null}
        mode="edit"
        initial={
          editTarget
            ? {
                name: editTarget.name,
                url: editTarget.url,
                icon: editTarget.icon,
              }
            : null
        }
        onClose={() => setEditTarget(null)}
        onSave={handleAddSave}
      />

      <Toast message={toast} />
    </div>
  );
}
