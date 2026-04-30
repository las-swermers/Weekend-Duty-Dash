"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { EmptyState, SectionShell } from "@/components/dashboard/sections";
import { PastoralRow, type PastoralEntry } from "@/components/shared/pastoral-row";

interface Props {
  id: string;
  num: string;
  title: string;
  titleEm: string;
  sub: string;
  emptyMessage: string;
  categories: string[];
  startISO?: string;
  endISO?: string;
  days?: number;
  limit?: number;
  refreshMs?: number;
}

type SortKey = "count" | "name";

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
};

const SORT_STORAGE_KEY = "live.dormSortKey";

function readStoredSort(): SortKey {
  if (typeof window === "undefined") return "count";
  return window.localStorage.getItem(SORT_STORAGE_KEY) === "name"
    ? "name"
    : "count";
}

export function PastoralDormPivot({
  id,
  num,
  title,
  titleEm,
  sub,
  emptyMessage,
  categories,
  startISO,
  endISO,
  days,
  limit = 200,
  refreshMs = 60_000,
}: Props) {
  const params = new URLSearchParams();
  params.set("categories", categories.join(","));
  if (startISO && endISO) {
    params.set("start", startISO);
    params.set("end", endISO);
  } else if (days) {
    params.set("days", String(days));
  }
  params.set("limit", String(limit));
  const url = `/api/orah/pastoral-by-category?${params.toString()}`;

  const { data } = useSWR<{ records: PastoralEntry[] }>(url, fetcher, {
    refreshInterval: refreshMs,
  });

  const [sortKey, setSortKey] = useState<SortKey>("count");
  useEffect(() => setSortKey(readStoredSort()), []);

  const updateSort = (next: SortKey) => {
    setSortKey(next);
    if (typeof window !== "undefined")
      window.localStorage.setItem(SORT_STORAGE_KEY, next);
  };

  const grouped = useMemo(() => {
    const records = data?.records ?? [];
    const groups = new Map<string, PastoralEntry[]>();
    for (const r of records) {
      const key = r.dorm || "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.date < b.date ? 1 : -1));
    }
    return groups;
  }, [data]);

  const sortedDorms = useMemo(() => {
    const dorms = Array.from(grouped.keys());
    dorms.sort((a, b) => {
      if (sortKey === "count") {
        const diff = (grouped.get(b)?.length ?? 0) - (grouped.get(a)?.length ?? 0);
        if (diff !== 0) return diff;
      }
      return a.localeCompare(b);
    });
    return dorms;
  }, [grouped, sortKey]);

  const total = data?.records.length ?? 0;

  return (
    <SectionShell
      id={id}
      num={num}
      title={title}
      titleEm={titleEm}
      sub={sub}
      meta={`${total} ENTRIES`}
    >
      <div className="weekend-cat-controls">
        <div className="weekend-cat-controls__group">
          <span className="weekend-cat-controls__label">Sort dorms by:</span>
          <button
            type="button"
            className={`btn btn--sm ${sortKey === "count" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => updateSort("count")}
          >
            Count
          </button>
          <button
            type="button"
            className={`btn btn--sm ${sortKey === "name" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => updateSort("name")}
          >
            Name
          </button>
        </div>
      </div>
      {!data ? (
        <EmptyState message="Loading…" />
      ) : total === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className="weekend-cat-grid">
          {sortedDorms.map((dorm) => {
            const entries = grouped.get(dorm) ?? [];
            const breakdown = countByCategory(entries);
            return (
              <details className="cat-card" key={dorm} open>
                <summary className="cat-card__summary">
                  <span className="cat-card__title">{dorm}</span>
                  <span className="cat-card__badge">{entries.length}</span>
                </summary>
                {breakdown.length > 0 && (
                  <div className="cat-card__breakdown">
                    {breakdown.map(([cat, n]) => (
                      <span key={cat} className="cat-card__breakdown-item">
                        {cat} {n}
                      </span>
                    ))}
                  </div>
                )}
                <div className="cat-card__body">
                  <div role="list">
                    {entries.map((e) => (
                      <PastoralRow key={e.id} entry={e} showCategory />
                    ))}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </SectionShell>
  );
}

function countByCategory(entries: PastoralEntry[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const e of entries) {
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}
