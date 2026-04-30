"use client";

import { useLayoutEffect, useRef, useState } from "react";

export interface PastoralEntry {
  id: number;
  date: string;
  studentName: string;
  studentInitials: string;
  dorm: string;
  category: string;
  description: string;
  createdBy: string;
}

export interface ServedEntry {
  recordId: number;
  servedBy: string;
  servedAt: string;
  note?: string;
}

interface Props {
  entry: PastoralEntry;
  served?: ServedEntry;
  onToggle?: (entry: PastoralEntry, currentlyServed: boolean) => void;
  onNote?: (entry: PastoralEntry, note: string) => void;
  showCategory?: boolean;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatServedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function PastoralRow({
  entry,
  served,
  onToggle,
  onNote,
  showCategory = true,
}: Props) {
  const isServed = Boolean(served);
  const [expanded, setExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(served?.note ?? "");
  const descRef = useRef<HTMLDivElement | null>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight - el.clientHeight > 1);
  }, [entry.description]);

  const handleToggle = () => {
    onToggle?.(entry, isServed);
  };

  const handleNoteSave = () => {
    onNote?.(entry, noteDraft.trim());
    setNoteOpen(false);
  };

  return (
    <div
      className={`row${isServed ? " row--served" : ""}`}
      role="listitem"
    >
      {onToggle && (
        <label className="row__check">
          <input
            type="checkbox"
            checked={isServed}
            onChange={handleToggle}
            aria-label={`Mark ${entry.studentName} as ${isServed ? "not served" : "served"}`}
          />
        </label>
      )}
      <div className="row__initials">{entry.studentInitials}</div>
      <div className="row__main">
        <div className="row__line">
          {entry.studentName}
          {showCategory && <> — {entry.category}</>}
        </div>
        <div className="row__sub">
          <span>{entry.dorm}</span>
          <span className="sep" />
          <span>{formatDateTime(entry.date)}</span>
          <span className="sep" />
          <span>by {entry.createdBy}</span>
        </div>
        {entry.description && (
          <>
            <div
              ref={descRef}
              className={`row__note${expanded ? " row__note--open" : ""}`}
            >
              {entry.description}
            </div>
            {(overflows || expanded) && (
              <button
                type="button"
                className="row__more"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "less" : "more…"}
              </button>
            )}
          </>
        )}
        {isServed && served && (
          <div className="row__served-meta">
            served by {served.servedBy.split("@")[0]} ·{" "}
            {formatServedAt(served.servedAt)}
            {served.note && <> · “{served.note}”</>}
          </div>
        )}
        {onNote && isServed && (
          <>
            {noteOpen ? (
              <div className="row__note-edit">
                <textarea
                  rows={2}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Optional note (e.g. completed Sat 14:00)"
                />
                <div className="row__note-edit-actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setNoteDraft(served?.note ?? "");
                      setNoteOpen(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={handleNoteSave}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="row__more"
                onClick={() => setNoteOpen(true)}
              >
                {served?.note ? "edit note" : "+ note"}
              </button>
            )}
          </>
        )}
      </div>
      <div className="row__meta">{isServed ? "✓" : "—"}</div>
    </div>
  );
}
