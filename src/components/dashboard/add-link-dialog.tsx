"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/dashboard/icon";

const ICON_OPTIONS = [
  "link",
  "book",
  "award",
  "users",
  "bus",
  "clipboard",
  "flag",
  "heart",
  "message",
  "phone",
  "calendar",
  "folder",
  "map",
  "key",
  "bell",
];

export interface AddLinkDraft {
  name: string;
  url: string;
  icon: string;
}

export interface EditLinkDraft extends AddLinkDraft {
  originalName: string;
  originalUrl: string;
}

interface Props {
  open: boolean;
  mode?: "add" | "edit";
  initial?: { name: string; url: string; icon: string } | null;
  onClose: () => void;
  onSave: (draft: AddLinkDraft | EditLinkDraft) => Promise<void> | void;
}

export function AddLinkDialog({
  open,
  mode = "add",
  initial,
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("link");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setUrl(initial?.url ?? "");
    setIcon(initial?.icon ?? "link");
    setError(null);
    setSubmitting(false);
  }, [open, initial]);

  if (!open) return null;

  const isEdit = mode === "edit";
  const valid = name.trim().length > 0 && url.trim().startsWith("https://");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const base = { name: name.trim(), url: url.trim(), icon };
      if (isEdit && initial) {
        await onSave({
          ...base,
          originalName: initial.name,
          originalUrl: initial.url,
        });
      } else {
        await onSave(base);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSubmitting(false);
    }
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
        <div className="dialog__eyebrow">
          Launchpad · {isEdit ? "Edit link" : "New link"}
        </div>
        <h2 className="dialog__title">
          {isEdit ? "Edit" : "Add"} a <em>link</em>
        </h2>
        <div className="dialog__sub">
          {isEdit
            ? "Updates the row in the source Google Sheet. Changes appear on the dashboard within ~30 seconds."
            : "Appended to the source Google Sheet. Visible to everyone on the dashboard within ~30 seconds."}
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
            disabled={submitting}
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
            disabled={submitting}
          />
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
                disabled={submitting}
              >
                <Icon name={i} size={16} />
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              border: "1px solid var(--coral-ink)",
              background: "var(--coral-soft)",
              color: "var(--coral-ink)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div className="dialog__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn--primary btn--sm"
            disabled={!valid || submitting}
          >
            <Icon name={isEdit ? "refresh" : "plus"} size={13} />
            {submitting
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : "Add to launchpad"}
          </button>
        </div>
      </form>
    </div>
  );
}
