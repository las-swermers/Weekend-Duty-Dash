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
import { signOutAction } from "@/lib/auth-actions";
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

// ─── Detail drawer (HC only for W1) ──────────────────────────────

type DrawerState = { kind: "hc"; item: HCStudent } | null;

function Drawer({
  state,
  onClose,
}: {
  state: DrawerState;
  onClose: () => void;
}) {
  if (!state) return null;
  const s = state.item;
  const name = s.name ?? s.initials;
  const tag = hcTagInfo(s);
  const fields: Array<[string, string]> = [
    ["Dorm", s.dorm || "—"],
    ["Location", s.location || "Health Center"],
    ["Reason", s.reason || "—"],
    ["Since", s.since],
    ["Status", tag.label],
  ];

  return (
    <>
      <div className="cr-drawer-backdrop" onClick={onClose} />
      <aside className="cr-drawer" role="dialog" aria-label={name}>
        <div className="cr-drawer__head">
          <div
            className="cr-drawer__photo"
            style={{ background: photoGradient(name) }}
            aria-hidden
          >
            {s.initials}
          </div>
          <div>
            <h2 className="cr-drawer__name">{name}</h2>
            <div className="cr-drawer__meta">{s.dorm}</div>
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
  // weekendRange will be wired into the Activities tab in W3.
  void weekendRange;
  const [active, setActive] = useState<TabKey>("byDorm");
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>(null);
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
    await Promise.all([hc.mutate(), noPa.mutate(), resources.mutate()]);
    setLastUpdated("just now");
    setRefreshing(false);
    showToast("Dashboard refreshed");
  }, [hc, noPa, resources, showToast]);

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

  const filteredStudents = useMemo(() => {
    if (active !== "hc" || !query.trim()) return allStudents;
    const q = query.toLowerCase();
    return allStudents.filter((s) =>
      [s.name, s.initials, s.dorm, s.location, s.reason]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [active, allStudents, query]);

  const counts: Record<TabKey, number> = {
    byDorm: 0, // wired in W4
    hc: allStudents.length,
    noPa: noPaStudents.length,
    weekendInfractions: 0, // wired in W2
    activities: 0, // wired in W3
  };

  const rosterCount =
    active === "hc" ? filteredStudents.length : 0;

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
        byDormLabel=""
      />
      <div className="cr-main cr-main--with-aside">
        <RosterShell
          active={active}
          query={query}
          setQuery={setQuery}
          count={rosterCount}
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
