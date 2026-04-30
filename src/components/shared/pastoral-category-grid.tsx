"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { EmptyState, SectionShell } from "@/components/dashboard/sections";
import { CollapsibleCategoryCard } from "@/components/shared/collapsible-category-card";
import type {
  PastoralEntry,
  ServedEntry,
} from "@/components/shared/pastoral-row";

interface Props {
  id: string;
  num: string;
  title: string;
  titleEm: string;
  sub: string;
  emptyMessage: string;
  categories: string[];
  startISO: string;
  endISO: string;
  limit?: number;
  refreshMs?: number;
  enableTickOff?: boolean;
  bucketISO?: string;
}

type SortKey = "date" | "dorm";

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
};

const SORT_STORAGE_KEY = "weekend.sortKey";
const HIDE_SERVED_STORAGE_KEY = "weekend.hideServed";

function readStoredSort(): SortKey {
  if (typeof window === "undefined") return "date";
  const v = window.localStorage.getItem(SORT_STORAGE_KEY);
  return v === "dorm" ? "dorm" : "date";
}

function readStoredHideServed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(HIDE_SERVED_STORAGE_KEY) === "1";
}

export function PastoralCategoryGrid({
  id,
  num,
  title,
  titleEm,
  sub,
  emptyMessage,
  categories,
  startISO,
  endISO,
  limit = 200,
  refreshMs = 60_000,
  enableTickOff = false,
  bucketISO,
}: Props) {
  const tickBucket = bucketISO ?? startISO;
  const url = `/api/orah/pastoral-by-category?categories=${encodeURIComponent(
    categories.join(","),
  )}&start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(
    endISO,
  )}&limit=${limit}`;

  const { data } = useSWR<{ records: PastoralEntry[] }>(url, fetcher, {
    refreshInterval: refreshMs,
  });

  const servedSwr = useSWR<{ served: ServedEntry[] }>(
    enableTickOff
      ? `/api/clipboard?weekend=${encodeURIComponent(tickBucket)}`
      : null,
    fetcher,
    { refreshInterval: refreshMs },
  );

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [hideServed, setHideServed] = useState(false);

  useEffect(() => {
    setSortKey(readStoredSort());
    setHideServed(readStoredHideServed());
  }, []);

  const updateSort = (next: SortKey) => {
    setSortKey(next);
    if (typeof window !== "undefined")
      window.localStorage.setItem(SORT_STORAGE_KEY, next);
  };

  const updateHideServed = (next: boolean) => {
    setHideServed(next);
    if (typeof window !== "undefined")
      window.localStorage.setItem(HIDE_SERVED_STORAGE_KEY, next ? "1" : "0");
  };

  const servedMap = useMemo(() => {
    const m = new Map<number, ServedEntry>();
    for (const s of servedSwr.data?.served ?? []) m.set(s.recordId, s);
    return m;
  }, [servedSwr.data]);

  const grouped = useMemo(() => {
    const records = data?.records ?? [];
    const visible = hideServed
      ? records.filter((r) => !servedMap.has(r.id))
      : records;
    const sorter = (a: PastoralEntry, b: PastoralEntry) => {
      if (sortKey === "dorm") {
        const cmp = a.dorm.localeCompare(b.dorm);
        if (cmp !== 0) return cmp;
      }
      return a.date < b.date ? 1 : -1;
    };
    const groups = new Map<string, PastoralEntry[]>();
    for (const cat of categories) groups.set(cat, []);
    for (const r of visible) {
      const matchKey = categories.find(
        (c) => c.toLowerCase() === r.category.toLowerCase(),
      );
      if (!matchKey) continue;
      groups.get(matchKey)!.push(r);
    }
    for (const list of groups.values()) list.sort(sorter);
    return groups;
  }, [data, categories, sortKey, hideServed, servedMap]);

  const totalVisible = useMemo(() => {
    let n = 0;
    for (const list of grouped.values()) n += list.length;
    return n;
  }, [grouped]);

  const handleToggle = useCallback(
    async (entry: PastoralEntry, currentlyServed: boolean) => {
      if (!enableTickOff) return;
      // Optimistic update
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
      await fetch("/api/clipboard", {
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
      void servedSwr.mutate();
    },
    [enableTickOff, servedSwr, tickBucket],
  );

  const handleNote = useCallback(
    async (entry: PastoralEntry, note: string) => {
      if (!enableTickOff) return;
      await fetch("/api/clipboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: entry.id,
          weekend: tickBucket,
          note,
        }),
      });
      void servedSwr.mutate();
    },
    [enableTickOff, servedSwr, tickBucket],
  );

  return (
    <SectionShell
      id={id}
      num={num}
      title={title}
      titleEm={titleEm}
      sub={sub}
      meta={`${totalVisible} ENTRIES`}
    >
      <div className="weekend-cat-controls">
        <div className="weekend-cat-controls__group">
          <span className="weekend-cat-controls__label">Sort:</span>
          <button
            type="button"
            className={`btn btn--sm ${sortKey === "date" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => updateSort("date")}
          >
            Date
          </button>
          <button
            type="button"
            className={`btn btn--sm ${sortKey === "dorm" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => updateSort("dorm")}
          >
            Dorm
          </button>
        </div>
        {enableTickOff && (
          <label className="weekend-cat-controls__filter">
            <input
              type="checkbox"
              checked={hideServed}
              onChange={(e) => updateHideServed(e.target.checked)}
            />
            Outstanding only
          </label>
        )}
      </div>
      {totalVisible === 0 && !data ? (
        <EmptyState message="Loading…" />
      ) : data && (data.records?.length ?? 0) === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className="weekend-cat-grid">
          {categories.map((cat) => (
            <CollapsibleCategoryCard
              key={cat}
              category={cat}
              entries={grouped.get(cat) ?? []}
              servedMap={enableTickOff ? servedMap : undefined}
              onToggle={enableTickOff ? handleToggle : undefined}
              onNote={enableTickOff ? handleNote : undefined}
            />
          ))}
        </div>
      )}
    </SectionShell>
  );
}
