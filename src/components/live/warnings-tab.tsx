"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { Icon } from "@/components/dashboard/icon";
import {
  formatDate,
  formatDateTime,
  photoGradient,
} from "@/components/live/format";
import type {
  WarningStudent,
  WarningsResponse,
} from "@/types/warnings";

// Slower than the 30s Orah poll: each refresh also reads the Google Sheet,
// and Sheets allows only 60 reads/min across the whole service account.
const REFRESH_MS = 60_000;
const DORM_KEY = "live.warningsDorm";

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
};

function levelLabel(s: WarningStudent): { text: string; tone: string } {
  const lv = s.effectiveLevel;
  if (lv <= 0) return { text: "Watching", tone: "low" };
  if (s.dueNow) {
    return {
      text: lv === 1 ? "Level 1 due" : `Level ${lv} — escalate`,
      tone: lv >= 2 ? "high" : "mid",
    };
  }
  return { text: `Level ${lv} · done`, tone: "done" };
}

function matchesQuery(s: WarningStudent, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [
    s.name,
    s.dorm,
    s.yearLevel ?? "",
    ...s.warningsThisWeek.map((w) => `${w.description} ${w.createdBy}`),
  ].some((v) => v.toLowerCase().includes(needle));
}

// ─── Detail drawer ───────────────────────────────────────────────
//
// Deliberately NOT the Drawer in live-client.tsx: that one renders a flat
// label/value list and branches on an if/else over its union, so a third
// kind would silently fall through. Same cr-drawer* classes, richer body.

function WarningDrawer({
  student,
  onClose,
}: {
  student: WarningStudent | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!student) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [student, onClose]);

  if (!student) return null;
  const lvl = levelLabel(student);

  return (
    <>
      <div className="cr-drawer-backdrop" onClick={onClose} />
      <aside className="cr-drawer" role="dialog" aria-label={student.name}>
        <div className="cr-drawer__head">
          <div
            className="cr-drawer__photo"
            style={{ background: photoGradient(student.name) }}
            aria-hidden
          >
            {student.initials}
          </div>
          <div>
            <h2 className="cr-drawer__name">{student.name}</h2>
            <div className="cr-drawer__meta">
              {student.dorm}
              {student.yearLevel ? ` · Year ${student.yearLevel}` : ""}
            </div>
          </div>
          <button
            type="button"
            className="cr-drawer__close"
            onClick={onClose}
            aria-label="Close detail"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="cr-drawer__body">
          <div className="cr-warn-drawer__summary">
            <span className={`cr-warn-badge cr-warn-badge--${lvl.tone}`}>
              {lvl.text}
            </span>
            <span className="cr-warn-drawer__stat">
              {student.warningsThisWeek.length} this week
            </span>
            <span className="cr-warn-drawer__stat">
              {student.warningsSinceLastConversation} since last conversation
            </span>
            <span className="cr-warn-drawer__stat">
              {student.termWarningCount} this term
            </span>
          </div>

          {student.levelOverride !== null && (
            <div className="cr-warn-drawer__override">
              Level manually set to {student.levelOverride} in the sheet
              {student.computedLevel !== student.levelOverride
                ? ` (calculated: ${student.computedLevel})`
                : ""}
              .
            </div>
          )}

          <h3 className="cr-warn-drawer__heading">Warnings this week</h3>
          {student.warningsThisWeek.length === 0 ? (
            <div className="cr-empty">None.</div>
          ) : (
            student.warningsThisWeek.map((w) => (
              <div key={w.id} className="cr-warn-item">
                <div className="cr-warn-item__desc">
                  {w.description || "(no description)"}
                </div>
                {w.action && (
                  <div className="cr-warn-item__extra">Action: {w.action}</div>
                )}
                {w.note && (
                  <div className="cr-warn-item__extra">Note: {w.note}</div>
                )}
                <div className="cr-warn-item__meta">
                  {formatDateTime(w.date)} · logged by {w.createdBy}
                </div>
              </div>
            ))
          )}

          {student.lastConversationAt && (
            <>
              <h3 className="cr-warn-drawer__heading">Last conversation</h3>
              <div className="cr-warn-item__meta">
                {formatDateTime(student.lastConversationAt)}
                {student.conversationCount > 1
                  ? ` · ${student.conversationCount} this term`
                  : ""}
              </div>
            </>
          )}

          {student.conversation?.response && (
            <>
              <h3 className="cr-warn-drawer__heading">Logged response</h3>
              <div className="cr-warn-item__desc">
                {student.conversation.response}
              </div>
              <div className="cr-warn-item__meta">
                by {student.conversation.loggedBy.split("@")[0]}
              </div>
            </>
          )}
        </div>

        <div className="cr-drawer__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── Student row ─────────────────────────────────────────────────

function StudentRow({
  student,
  week,
  canLog,
  busy,
  onToggle,
  onSaveResponse,
  onOpen,
}: {
  student: WarningStudent;
  week: string;
  canLog: boolean;
  busy: boolean;
  onToggle: (s: WarningStudent, currentlyDone: boolean) => void;
  onSaveResponse: (s: WarningStudent, response: string) => void;
  onOpen: (s: WarningStudent) => void;
}) {
  const done = student.conversation?.status === "done";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(student.conversation?.response ?? "");
  const lvl = levelLabel(student);

  // Re-sync when the row is replaced by a fresh fetch or the week changes.
  useEffect(() => {
    setDraft(student.conversation?.response ?? "");
    setEditing(false);
  }, [student.conversation?.response, week]);

  return (
    <div className={`row${done ? " row--served" : ""}`} role="listitem">
      {canLog && (
        <label className="row__check">
          <input
            type="checkbox"
            checked={done}
            disabled={busy}
            onChange={() => onToggle(student, done)}
            aria-label={`Mark conversation with ${student.name} as ${done ? "not had" : "had"}`}
          />
        </label>
      )}

      <button
        type="button"
        className="row__initials cr-warn-row__avatar"
        style={{ background: photoGradient(student.name) }}
        onClick={() => onOpen(student)}
        aria-label={`Open warnings for ${student.name}`}
      >
        {student.initials}
      </button>

      <div className="row__main">
        <div className="row__line">
          <button
            type="button"
            className="cr-warn-row__name"
            onClick={() => onOpen(student)}
          >
            {student.name}
          </button>
          <span className={`cr-warn-badge cr-warn-badge--${lvl.tone}`}>
            {lvl.text}
          </span>
        </div>

        <div className="row__sub">
          <span>{student.dorm}</span>
          {student.yearLevel && (
            <>
              <span className="sep" />
              <span>Year {student.yearLevel}</span>
            </>
          )}
          <span className="sep" />
          <span>
            {student.warningsThisWeek.length} this week
          </span>
          <span className="sep" />
          <span>
            {student.warningsSinceLastConversation} since last talk
          </span>
          <span className="sep" />
          <span>{student.termWarningCount} this term</span>
        </div>

        <div className="cr-warn-row__preview">
          {student.warningsThisWeek.slice(0, 3).map((w) => (
            <div key={w.id} className="cr-warn-row__line">
              <span className="cr-warn-row__when">{formatDate(w.date)}</span>
              <span>{w.description || "(no description)"}</span>
            </div>
          ))}
          {student.warningsThisWeek.length > 3 && (
            <button
              type="button"
              className="row__more"
              onClick={() => onOpen(student)}
            >
              +{student.warningsThisWeek.length - 3} more…
            </button>
          )}
        </div>

        {done && student.conversation && (
          <div className="row__served-meta">
            conversation logged by{" "}
            {student.conversation.loggedBy.split("@")[0] || "—"}
            {student.conversation.conversationDate
              ? ` · ${formatDate(student.conversation.conversationDate)}`
              : ""}
            {student.conversation.response && !editing && (
              <> · “{student.conversation.response}”</>
            )}
          </div>
        )}

        {canLog && done && (
          <>
            {editing ? (
              <div className="row__note-edit">
                <textarea
                  rows={3}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={2000}
                  placeholder="What was said? e.g. discussed curfew, agreed to check in nightly this week"
                />
                <div className="row__note-edit-actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setDraft(student.conversation?.response ?? "");
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={busy}
                    onClick={() => {
                      onSaveResponse(student, draft.trim());
                      setEditing(false);
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="row__more"
                onClick={() => setEditing(true)}
              >
                {student.conversation?.response
                  ? "edit response"
                  : "+ log response"}
              </button>
            )}
          </>
        )}
      </div>

      <div className="row__meta">{done ? "✓" : "—"}</div>
    </div>
  );
}

// ─── Tab ─────────────────────────────────────────────────────────

export function WarningsTab({
  query,
  onCount,
}: {
  query: string;
  onCount: (n: number) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [dorm, setDorm] = useState("all");
  const [drawer, setDrawer] = useState<WarningStudent | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Restore the dorm this device last reviewed — one dorm uses this weekly.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DORM_KEY);
      if (saved) setDorm(saved);
    } catch {
      /* private mode */
    }
  }, []);

  const pickDorm = useCallback((next: string) => {
    setDorm(next);
    try {
      window.localStorage.setItem(DORM_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (offset !== 0) params.set("offset", String(offset));
    if (dorm !== "all") params.set("dorm", dorm);
    const qs = params.toString();
    return `/api/warnings${qs ? `?${qs}` : ""}`;
  }, [offset, dorm]);

  const { data, error, isLoading, mutate } = useSWR<WarningsResponse>(
    url,
    fetcher,
    { refreshInterval: REFRESH_MS, keepPreviousData: true },
  );

  const students = useMemo(
    () => (data?.students ?? []).filter((s) => matchesQuery(s, query.trim())),
    [data, query],
  );

  useEffect(() => {
    onCount(students.length);
  }, [students.length, onCount]);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const writeConversation = useCallback(
    async (s: WarningStudent, body: Record<string, unknown>) => {
      if (!data) return;
      setBusy(true);
      try {
        const res = await fetch("/api/warnings/conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: s.studentId,
            week: data.week.key,
            studentName: s.name,
            dorm: s.dorm,
            ...body,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || `${res.status} ${res.statusText}`);
        }
        await mutate();
      } catch (err) {
        // The sheet is the source of truth — if the write failed, say so
        // rather than leaving a tick that exists only on screen.
        flash(
          err instanceof Error
            ? `Could not save: ${err.message}`
            : "Could not save to the sheet.",
        );
        await mutate();
      } finally {
        setBusy(false);
      }
    },
    [data, mutate, flash],
  );

  const handleToggle = useCallback(
    async (s: WarningStudent, currentlyDone: boolean) => {
      if (!data) return;
      if (!currentlyDone) {
        await writeConversation(s, {
          status: "done",
          response: s.conversation?.response ?? "",
        });
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/warnings/conversation", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: s.studentId,
            week: data.week.key,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || `${res.status} ${res.statusText}`);
        }
        await mutate();
      } catch (err) {
        flash(
          err instanceof Error
            ? `Could not clear: ${err.message}`
            : "Could not clear the row.",
        );
        await mutate();
      } finally {
        setBusy(false);
      }
    },
    [data, mutate, writeConversation, flash],
  );

  const handleSaveResponse = useCallback(
    (s: WarningStudent, response: string) =>
      writeConversation(s, { status: "done", response }),
    [writeConversation],
  );

  const pushToSheet = useCallback(async () => {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch("/api/warnings/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week: data.week.key, dorm }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        tabTitle?: string;
      };
      if (!res.ok) throw new Error(j.error || `${res.status}`);
      flash(`Written to “${j.tabTitle}” in the sheet.`);
    } catch (err) {
      flash(
        err instanceof Error
          ? `Could not write the report: ${err.message}`
          : "Could not write the report.",
      );
    } finally {
      setBusy(false);
    }
  }, [data, dorm, flash]);

  const canLog = Boolean(data?.meta.sheetConfigured);
  const reportHref = data
    ? `/warnings/report?week=${encodeURIComponent(data.week.key)}${
        dorm !== "all" ? `&dorm=${encodeURIComponent(dorm)}` : ""
      }`
    : "#";

  return (
    <>
      <div className="cr-warn-bar no-print">
        <div className="cr-warn-weeknav">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setOffset((o) => o - 1)}
            aria-label="Previous week"
          >
            ‹
          </button>
          <span className="cr-warn-weeknav__label">
            {data?.week.label ?? "Loading…"}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset >= 0}
            aria-label="Next week"
          >
            ›
          </button>
          {offset !== 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setOffset(0)}
            >
              This week
            </button>
          )}
        </div>

        <div className="cr-warn-bar__actions">
          <a
            className="btn btn--ghost btn--sm"
            href={reportHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="external" size={14} /> Print report
          </a>
          {canLog && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={pushToSheet}
              disabled={busy || !data}
            >
              <Icon name="send" size={14} /> Push to Sheet
            </button>
          )}
        </div>
      </div>

      {(data?.meta.dorms.length ?? 0) > 0 && (
        <div className="cr-dorm-chips no-print">
          <span className="cr-dorm-chips__label">Dorm</span>
          <button
            type="button"
            className={`cr-dorm-chip${dorm === "all" ? " is-on" : ""}`}
            onClick={() => pickDorm("all")}
            aria-pressed={dorm === "all"}
          >
            All
          </button>
          {(data?.meta.dorms ?? []).map((d) => (
            <button
              key={d}
              type="button"
              className={`cr-dorm-chip${dorm === d ? " is-on" : ""}`}
              onClick={() => pickDorm(d)}
              aria-pressed={dorm === d}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {notice && <div className="cr-warn-notice">{notice}</div>}

      {!canLog && data && (
        <div className="cr-warn-notice cr-warn-notice--muted">
          Read-only: no warnings sheet configured. Set{" "}
          <code>WARNINGS_SHEET_ID</code> plus the Google service-account env
          vars to log conversations.
        </div>
      )}

      {error ? (
        <div className="cr-empty">
          Could not load warnings: {(error as Error).message}
        </div>
      ) : isLoading && !data ? (
        <div className="cr-empty">Loading…</div>
      ) : students.length === 0 ? (
        <div className="cr-empty">
          {query.trim()
            ? "No students match that search."
            : "No warnings logged for this week."}
        </div>
      ) : (
        <div className="cr-serve" role="list">
          {students.map((s) => (
            <StudentRow
              key={s.studentId}
              student={s}
              week={data?.week.key ?? ""}
              canLog={canLog}
              busy={busy}
              onToggle={handleToggle}
              onSaveResponse={handleSaveResponse}
              onOpen={setDrawer}
            />
          ))}
        </div>
      )}

      {data && (
        <div className="cr-warn-foot no-print">
          Escalates at {data.meta.threshold} warnings since the last logged
          conversation
          {data.meta.sensitiveSuppressed > 0
            ? ` · ${data.meta.sensitiveSuppressed} sensitive record${data.meta.sensitiveSuppressed === 1 ? "" : "s"} hidden`
            : ""}
        </div>
      )}

      <WarningDrawer student={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}
