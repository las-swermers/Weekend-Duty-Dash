"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/dashboard/icon";
import { ICON_OPTIONS } from "@/lib/mock";
import { CATEGORIES, type ResourceCategory } from "@/types/resource";

export interface ResourceDraft {
  name: string;
  url: string;
  icon: string;
  category: ResourceCategory;
}

interface Props {
  open: boolean;
  defaultCategory: ResourceCategory | null;
  onClose: () => void;
  onSave: (draft: ResourceDraft) => void;
}

export function AddResourceDialog({
  open,
  defaultCategory,
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("link");
  const [category, setCategory] = useState<ResourceCategory>(
    defaultCategory ?? "Reference",
  );

  useEffect(() => {
    if (open) {
      setName("");
      setUrl("");
      setIcon("link");
      setCategory(defaultCategory ?? "Reference");
    }
  }, [open, defaultCategory]);

  if (!open) return null;

  const valid = name.trim().length > 0 && url.trim().startsWith("https://");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({ name: name.trim(), url: url.trim(), icon, category });
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSave}
      >
        <button type="button" className="dialog__close" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
        <div className="dialog__eyebrow">Launchpad · New entry</div>
        <h2 className="dialog__title">
          Add a <em>resource</em>
        </h2>
        <div className="dialog__sub">
          Pin a sheet, doc, or link that the duty team will need this weekend.
        </div>

        <div className="field">
          <label htmlFor="r-name">Name</label>
          <input
            id="r-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Saturday catch-up roster"
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="r-url">URL (https only)</label>
          <input
            id="r-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/…"
          />
        </div>

        <div className="field--row">
          <div className="field">
            <label htmlFor="r-cat">Category</label>
            <select
              id="r-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as ResourceCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Selected icon</label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                border: "1px solid var(--rule)",
                background: "var(--paper-2)",
                height: 42,
              }}
            >
              <Icon name={icon} size={18} />
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  color: "var(--ink-3)",
                }}
              >
                {icon}
              </span>
            </div>
          </div>
        </div>

        <div className="field">
          <label>Icon</label>
          <div className="icon-grid">
            {ICON_OPTIONS.map((i) => (
              <button
                type="button"
                key={i}
                className={i === icon ? "is-on" : undefined}
                onClick={() => setIcon(i)}
                title={i}
              >
                <Icon name={i} size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className="dialog__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn--primary btn--sm"
            disabled={!valid}
          >
            <Icon name="plus" size={13} /> Add to launchpad
          </button>
        </div>
      </form>
    </div>
  );
}
