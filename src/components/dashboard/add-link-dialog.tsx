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

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (draft: AddLinkDraft) => Promise<void> | void;
}

export function AddLinkDialog({ open, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("link");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setUrl("");
      setIcon("link");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const valid = name.trim().length > 0 && url.trim().startsWith("https://");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), url: url.trim(), icon });
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
        <div className="dialog__eyebrow">Launchpad · New link</div>
        <h2 className="dialog__title">
          Add a <em>link</em>
        </h2>
        <div className="dialog__sub">
          Appended to the source Google Sheet. Visible to everyone on the
          dashboard within ~30 seconds.
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
            <Icon name="plus" size={13} />
            {submitting ? "Saving…" : "Add to launchpad"}
          </button>
        </div>
      </form>
    </div>
  );
}
