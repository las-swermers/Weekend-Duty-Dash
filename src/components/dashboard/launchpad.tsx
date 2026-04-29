"use client";

import { Icon } from "@/components/dashboard/icon";
import type { Resource } from "@/types/resource";

interface Props {
  resources: Resource[];
  mode?: "kv" | "sheet" | "seed" | "fallback";
  editUrl?: string | null;
}

export function Launchpad({ resources, mode = "kv", editUrl }: Props) {
  const sheetMode = mode === "sheet" || mode === "fallback";

  return (
    <section className="launchpad" id="launchpad">
      <div className="launchpad__head">
        <h2>
          <em>Launch</em>
        </h2>
        {sheetMode && editUrl && (
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--ghost btn--sm"
            style={{ alignSelf: "end" }}
          >
            <Icon name="external" size={13} />
            Edit in Sheets
          </a>
        )}
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
