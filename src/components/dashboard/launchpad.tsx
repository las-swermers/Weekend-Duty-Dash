"use client";

import { useMemo } from "react";

import { Icon } from "@/components/dashboard/icon";
import { CATEGORIES, type Resource, type ResourceCategory } from "@/types/resource";

interface Props {
  resources: Resource[];
}

export function Launchpad({ resources }: Props) {
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
          <em>Launch</em>
        </h2>
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
            </div>
          </div>
        );
      })}
    </section>
  );
}
