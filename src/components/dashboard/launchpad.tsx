"use client";

import { Icon } from "@/components/dashboard/icon";
import type { Resource } from "@/types/resource";

interface Props {
  resources: Resource[];
  mode?: "kv" | "sheet" | "seed" | "fallback";
  editUrl?: string | null;
  canAdd?: boolean;
  onAdd?: () => void;
  onRemove?: (resource: Resource) => void;
  onEdit?: (resource: Resource) => void;
}

export function Launchpad({
  resources,
  mode = "kv",
  editUrl,
  canAdd = false,
  onAdd,
  onRemove,
  onEdit,
}: Props) {
  const sheetMode = mode === "sheet" || mode === "fallback";
  const canRemove = canAdd && sheetMode && Boolean(onRemove);
  const canEditTile = canAdd && sheetMode && Boolean(onEdit);

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
          <div className="tile-cell" key={r.id}>
            <a
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
            {canEditTile && (
              <button
                type="button"
                className="tile__edit"
                onClick={() => onEdit?.(r)}
                aria-label={`Edit ${r.name}`}
                title={`Edit ${r.name}`}
              >
                <Icon name="refresh" size={12} />
              </button>
            )}
            {canRemove && (
              <button
                type="button"
                className="tile__delete"
                onClick={() => onRemove?.(r)}
                aria-label={`Remove ${r.name}`}
                title={`Remove ${r.name}`}
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {onAdd && (
        <button
          type="button"
          className="tile tile--add launchpad__add"
          onClick={onAdd}
          title={
            canAdd
              ? "Add a launchpad link"
              : "Launchpad writes are disabled — see env config"
          }
        >
          <Icon name="plus" size={16} />
          <span className="tile__name">Add link</span>
        </button>
      )}
    </section>
  );
}
