"use client";

import { Icon } from "@/components/dashboard/icon";
import type { Resource } from "@/types/resource";

interface Props {
  resources: Resource[];
}

export function Launchpad({ resources }: Props) {
  return (
    <section className="launchpad" id="launchpad">
      <div className="launchpad__head">
        <h2>
          <em>Launch</em>
        </h2>
      </div>

      <div className="cat-grid">
        {resources.map((r) => (
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
    </section>
  );
}
