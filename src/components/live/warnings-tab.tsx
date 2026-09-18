"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { Icon } from "@/components/dashboard/icon";
import {
  formatDate,
  formatDateTime,
  photoGradient,
} from "@/components/live/format";
import type { WarningStudent, WarningsResponse } from "@/types/warnings";

// Slower than the 30s Orah poll: each refresh also reads the Google Sheet,
// and Sheets allows only 60 reads/min across the whole service account.
const REFRESH_MS = 60_000;
const DORM_KEY = "live.warningsDorm";
const LEGEND_KEY = "live.warningsLegend";

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
};

// Google puts the actual cause of a 4xx in the response body — "…API has not
// been used in project X or it is disabled" vs "The caller does not have
// permission" need completely different fixes. The routes pass it through as
// bodyPreview; show it rather than a bare status code.
async function errorText(res: Response): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as {
    error?: string;
    bodyPreview?: string;
  };
  const head = j.error || `${res.status} ${res.statusText}`;
  const detail = j.bodyPreview?.trim();
  if (!detail) return head;
  const cleaned = detail.replace(/\s+/g, " ").slice(0, 240);
  return `${head} — ${cleaned}`;
}

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

// Cards are grouped by urgency so the review starts where it matters.
function groupOf(s: WarningStudent): { key: string; order: number } {
  const lv = s.effectiveLevel;
  if (lv >= 2 && s.dueNow) return { key: `Level ${lv} — escalate`, order: 0 };
  if (lv >= 1 && s.dueNow) return { key: "Level 1 due", order: 1 };
  if (lv >= 1) return { key: `Level ${lv} · conversation logged`, order: 2 };
  return { key: "Watching", order: 3 };
}

// "11 since last talk" is nonsense when there has never been a talk — the
// count is correct, the framing isn't.
function unaddressedLabel(s: WarningStudent): string {
  return s.lastConversationAt
    ? `${s.warningsSinceLastConversation} since last talk`
    : `${s.warningsSinceLastConversation} unaddressed`;
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

// ─── Level legend ────────────────────────────────────────────────

export function LevelLegend({ threshold }: { threshold: number }) {
  const rows: Array<[string, string, string]> = [
    ["low", "Watching", `Fewer than ${threshold} unaddressed warnings — no action`],
    ["mid", "Level 1 due", `${threshold}+ warnings, no conversation logged — have the talk`],
    ["done", "Level 1 · done", "Talk logged, quiet since"],
    ["high", "Level 2 — escalate", `${threshold}+ more warnings after a logged talk`],
  ];
  return (
    <div className="cr-warn-legend">
      {rows.map(([tone, label, meaning]) => (
        <div key={label} className="cr-warn-legend__item">
          <span className={`cr-warn-badge cr-warn-badge--${tone}`}>{label}</span>
          <span className="cr-warn-legend__text">{meaning}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────

function WarningCard({
  student,
  canLog,
  busy,
  onToggle,
  onOpen,
}: {
  student: WarningStudent;
  canLog: boolean;
  busy: boolean;
  onToggle: (s: WarningStudent, currentlyDone: boolean) => void;
  onOpen: (s: WarningStudent) => void;
}) {
  const done = student.conversation?.status === "done";
  const lvl = levelLabel(student);
  const preview = student.warningsThisWeek.slice(0, 2);
  const extra = student.warningsThisWeek.length - preview.length;

  return (
    <div className={`cr-warn-card${done ? " cr-warn-card--done" : ""}`}>
      {canLog && (
        <label
          className="cr-warn-card__check"
          title={done ? "Conversation logged" : "Mark conversation had"}
        >
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
        className="cr-warn-card__hit"
        onClick={() => onOpen(student)}
        title={`${student.name} · open warnings`}
      >
        <div
          className="cr-serve-card__photo"
          style={{ background: photoGradient(student.name) }}
          aria-hidden
        >
          {student.initials}
        </div>

        <div className="cr-serve-card__body">
          <div className="cr-warn-card__name">{student.name}</div>
          <div className="cr-serve-card__sub">
            {student.dorm}
            {student.yearLevel ? ` · Yr ${student.yearLevel}` : ""}
          </div>
          <div className="cr-warn-card__stats">
            {student.warningsThisWeek.length} this week ·{" "}
            {unaddressedLabel(student)} · {student.termWarningCount} term
          </div>

          <div className="cr-warn-card__lines">
            {preview.map((w) => (
              <div key={w.id} className="cr-warn-card__line">
                <span className="cr-warn-card__when">{formatDate(w.date)}</span>
                <span className="cr-warn-card__what">
                  {w.description || "(no description)"}
                </span>
                <span className="cr-warn-card__who">{w.createdBy}</span>
              </div>
            ))}
            {extra > 0 && (
              <div className="cr-warn-card__more">+{extra} more…</div>
            )}
          </div>

          <span className={`cr-warn-badge cr-warn-badge--${lvl.tone}`}>
            {lvl.text}
          </span>
        </div>
      </button>
    </div>
  );
}

// ─── Detail drawer ───────────────────────────────────────────────
//
// Deliberately NOT the Drawer in live-client.tsx: that one renders a flat
// label/value list and branches on an if/else over its union, so a third
// kind would silently fall through. Same cr-drawer* classes, richer body.
// The response editor lives here rather than on the card so card heights
// stay uniform in the auto-fill grid.

function WarningDrawer({
  student,
  canLog,
  busy,
  onClose,
  onToggle,
  onSaveResponse,
}: {
  student: WarningStudent | null;
  canLog: boolean;
  busy: boolean;
  onClose: () => void;
  onToggle: (s: WarningStudent, currentlyDone: boolean) => void;
  onSaveResponse: (s: WarningStudent, response: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const responseText = student?.conversation?.response ?? "";
  const studentId = student?.studentId;

  useEffect(() => {
    setDraft(responseText);
  }, [responseText, studentId]);

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
  const done = student.conversation?.status === "done";

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
              {unaddressedLabel(student)}
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

          {canLog && (
            <>
              <h3 className="cr-warn-drawer__heading">Follow-up conversation</h3>
              <label className="cr-warn-drawer__toggle">
                <input
                  type="checkbox"
                  checked={done}
                  disabled={busy}
                  onChange={() => onToggle(student, done)}
                />
                <span>Had this conversation</span>
              </label>

              <textarea
                className="cr-warn-drawer__note"
                rows={4}
                value={draft}
                maxLength={2000}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="What was said? e.g. discussed curfew, agreed to check in nightly this week"
              />
              <div className="cr-warn-drawer__note-actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busy || draft.trim() === responseText.trim()}
                  onClick={() => onSaveResponse(student, draft.trim())}
                >
                  Save response
                </button>
              </div>
              {student.conversation?.loggedBy && (
                <div className="cr-warn-item__meta">
                  last saved by {student.conversation.loggedBy.split("@")[0]}
                </div>
              )}
            </>
          )}

          {!canLog && student.conversation?.response && (
            <>
              <h3 className="cr-warn-drawer__heading">Logged response</h3>
              <div className="cr-warn-item__desc">
                {student.conversation.response}
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
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);

  // Restore the dorm this device last reviewed — one dorm uses this weekly.
  // The legend starts open (it exists to be read) but stays closed once
  // someone has dismissed it on this device.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DORM_KEY);
      if (saved) setDorm(saved);
      if (window.localStorage.getItem(LEGEND_KEY) === "closed") {
        setLegendOpen(false);
      }
    } catch {
      /* private mode */
    }
  }, []);

  const toggleLegend = useCallback(() => {
    setLegendOpen((open) => {
      const next = !open;
      try {
        window.localStorage.setItem(LEGEND_KEY, next ? "open" : "closed");
      } catch {
        /* private mode */
      }
      return next;
    });
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

  // Keep the open drawer bound to the id, not a snapshot, so it reflects a
  // save without needing to close and reopen.
  const drawerStudent = useMemo(
    () => students.find((s) => s.studentId === drawerId) ?? null,
    [students, drawerId],
  );

  const groups = useMemo(() => {
    const m = new Map<string, { order: number; list: WarningStudent[] }>();
    for (const s of students) {
      const g = groupOf(s);
      const bucket = m.get(g.key);
      if (bucket) bucket.list.push(s);
      else m.set(g.key, { order: g.order, list: [s] });
    }
    return Array.from(m, ([key, v]) => ({ key, ...v })).sort(
      (a, b) => a.order - b.order,
    );
  }, [students]);

  useEffect(() => {
    onCount(students.length);
  }, [students.length, onCount]);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 8000);
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
        if (!res.ok) throw new Error(await errorText(res));
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
        if (!res.ok) throw new Error(await errorText(res));
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
      if (!res.ok) throw new Error(await errorText(res));
      const j = (await res.json()) as { tabTitle?: string };
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
  const threshold = data?.meta.threshold ?? 3;
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
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={toggleLegend}
            aria-expanded={legendOpen}
          >
            <Icon name="flag" size={14} /> Levels
          </button>
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

      {legendOpen && <LevelLegend threshold={threshold} />}

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
        <div className="cr-serve">
          {groups.map((g) => (
            <div key={g.key} className="cr-serve__group">
              <div className="cr-serve__group-head">
                <h3 className="cr-serve__group-title">{g.key}</h3>
                <span className="cr-serve__group-count">
                  {g.list.length}{" "}
                  {g.list.length === 1 ? "student" : "students"}
                </span>
              </div>
              <div className="cr-serve__group-body">
                {g.list.map((s) => (
                  <WarningCard
                    key={s.studentId}
                    student={s}
                    canLog={canLog}
                    busy={busy}
                    onToggle={handleToggle}
                    onOpen={(st) => setDrawerId(st.studentId)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="cr-warn-foot no-print">
          Escalates at {threshold} warnings since the last logged conversation
          {data.meta.sensitiveSuppressed > 0
            ? ` · ${data.meta.sensitiveSuppressed} sensitive record${data.meta.sensitiveSuppressed === 1 ? "" : "s"} hidden`
            : ""}
        </div>
      )}

      <WarningDrawer
        student={drawerStudent}
        canLog={canLog}
        busy={busy}
        onClose={() => setDrawerId(null)}
        onToggle={handleToggle}
        onSaveResponse={handleSaveResponse}
      />
    </>
  );
}
