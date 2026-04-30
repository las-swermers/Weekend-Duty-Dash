"use client";

import {
  PastoralRow,
  type PastoralEntry,
  type ServedEntry,
} from "@/components/shared/pastoral-row";

interface Props {
  category: string;
  entries: PastoralEntry[];
  servedMap?: Map<number, ServedEntry>;
  onToggle?: (entry: PastoralEntry, currentlyServed: boolean) => void;
  onNote?: (entry: PastoralEntry, note: string) => void;
}

export function CollapsibleCategoryCard({
  category,
  entries,
  servedMap,
  onToggle,
  onNote,
}: Props) {
  const total = entries.length;
  const outstanding = servedMap
    ? entries.filter((e) => !servedMap.has(e.id)).length
    : total;
  const defaultOpen = total > 0 && (servedMap ? outstanding > 0 : true);

  return (
    <details className="cat-card" open={defaultOpen}>
      <summary className="cat-card__summary">
        <span className="cat-card__title">{category}</span>
        <span
          className={`cat-card__badge${
            outstanding === 0 ? " cat-card__badge--clear" : ""
          }`}
        >
          {servedMap ? `${outstanding}/${total}` : total}
        </span>
      </summary>
      <div className="cat-card__body">
        {total === 0 ? (
          <div className="section__empty">No entries this weekend.</div>
        ) : (
          <div role="list">
            {entries.map((e) => (
              <PastoralRow
                key={e.id}
                entry={e}
                served={servedMap?.get(e.id)}
                onToggle={onToggle}
                onNote={onNote}
                showCategory={false}
              />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
