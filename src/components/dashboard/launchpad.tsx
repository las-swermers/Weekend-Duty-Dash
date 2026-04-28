"use client";

import { useMemo } from "react";

import { Icon } from "@/components/dashboard/icon";
import { CATEGORIES, type Resource, type ResourceCategory } from "@/types/resource";

interface Props {
  resources: Resource[];
  onAdd: (category: ResourceCategory) => void;
}

export function Launchpad({ resources, onAdd }: Props) {
  const grouped = useMemo(() => {
    const g: Partial<Record<ResourceCategory, Resource[]>> = {};
    for (const r of resources) {
      const list = g[r.category] ?? [];
      list.push(r);
      g[r.category] = list;
    }
    return g;
  }, [resources]);

  return (
    <section className="launchpad" id="launchpad">
      <div className="launchpad__head">
        <h2>
          The <em>launchpad</em>
        </h2>
        <p className="launchpad__lede">
          Living references and rosters. Bookmark anything that gets opened
          more than twice on a duty weekend.
        </p>
      </div>

      {CATEGORIES.map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        return (
          <div className="cat-block" key={cat}>
            <div className="cat-block__head">
              <div className="cat-block__title">{cat}</div>
              <div className="cat-block__count">
                {String(items.length).padStart(2, "0")} ITEMS
              </div>
            </div>
            <div className="cat-grid">
              {items.map((r) => (
                <a
                  key={r.id}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tile"
                >
                  <div className="tile__icon">
                    <Icon name={r.icon} size={22} />
                  </div>
                  <div className="tile__name">{r.name}</div>
                  <div className="tile__ext">
                    <Icon name="external" size={13} />
                  </div>
                </a>
              ))}
              <button
                type="button"
                className="tile tile--add"
                onClick={() => onAdd(cat)}
              >
                <Icon name="plus" size={18} />
                <div className="tile__name">Add</div>
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
