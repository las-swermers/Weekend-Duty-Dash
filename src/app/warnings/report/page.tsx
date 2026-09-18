// Printable weekly warnings review. Server-rendered so Cmd-P captures the
// whole thing (no client fetch to race the print dialog). Each student gets
// ruled blank lines to write the follow-up conversation on by hand.
//
// /warnings/report?week=2026-09-14&dorm=Savoy

import Link from "next/link";

import { getWarningsForWeek } from "@/lib/warnings";
import { requireWarningsAccess } from "@/lib/warnings-auth";
import type { WarningStudent } from "@/types/warnings";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Warnings review · LAS Duty Dashboard",
};

const TZ = "Europe/Zurich";

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function levelText(s: WarningStudent): string {
  if (s.effectiveLevel <= 0) return "Watching";
  if (s.dueNow) {
    return s.effectiveLevel === 1
      ? "Level 1 — conversation due"
      : `Level ${s.effectiveLevel} — escalate`;
  }
  return `Level ${s.effectiveLevel} · conversation logged`;
}

export default async function WarningsReportPage({
  searchParams,
}: {
  searchParams: { week?: string; dorm?: string };
}) {
  const access = await requireWarningsAccess();
  if (!access.ok) {
    return (
      <div className="wr">
        <h1 className="wr__title">Access denied</h1>
        <p className="wr__sub">
          {access.reason === "not-allowlisted"
            ? `${access.email ?? "This account"} is not on the warnings allowlist.`
            : "Sign in to continue."}
        </p>
        <Link href="/live" className="btn btn--ghost btn--sm no-print">
          ← Back to the dashboard
        </Link>
      </div>
    );
  }

  const dorm = searchParams.dorm;
  let data;
  try {
    data = await getWarningsForWeek({ weekKey: searchParams.week, dorm });
  } catch (err) {
    return (
      <div className="wr">
        <h1 className="wr__title">Could not build the report</h1>
        <p className="wr__sub">
          {err instanceof Error ? err.message : "Unknown error."}
        </p>
        <Link href="/live" className="btn btn--ghost btn--sm no-print">
          ← Back to the dashboard
        </Link>
      </div>
    );
  }

  const totalWarnings = data.students.reduce(
    (n, s) => n + s.warningsThisWeek.length,
    0,
  );

  return (
    <div className="wr">
      <div className="wr__toolbar no-print">
        <Link href="/live" className="btn btn--ghost btn--sm">
          ← Back to the dashboard
        </Link>
        <span className="wr__hint">
          Use your browser’s Print (⌘P / Ctrl-P) to save this as a PDF.
        </span>
      </div>

      <header className="wr__head">
        <div className="wr__crest">Leysin American School · Dorm Review</div>
        <h1 className="wr__title">Warnings — {data.week.label}</h1>
        <div className="wr__sub">
          {dorm && dorm !== "all" ? `${dorm} · ` : "All dorms · "}
          {data.students.length} student
          {data.students.length === 1 ? "" : "s"} · {totalWarnings} warning
          {totalWarnings === 1 ? "" : "s"} · escalates at {data.meta.threshold}{" "}
          since last conversation
        </div>
      </header>

      {data.students.length === 0 ? (
        <p className="wr__sub">No warnings logged for this week.</p>
      ) : (
        data.students.map((s) => (
          <section key={s.studentId} className="wr-student">
            <div className="wr-student__head">
              <h2 className="wr-student__name">{s.name}</h2>
              <span className="wr-student__level">{levelText(s)}</span>
            </div>
            <div className="wr-student__meta">
              {s.dorm}
              {s.yearLevel ? ` · Year ${s.yearLevel}` : ""} ·{" "}
              {s.warningsThisWeek.length} this week ·{" "}
              {s.warningsSinceLastConversation} since last conversation ·{" "}
              {s.termWarningCount} this term
              {s.lastConversationAt
                ? ` · last talk ${when(s.lastConversationAt)}`
                : ""}
            </div>

            <table className="wr-table">
              <thead>
                <tr>
                  <th className="wr-table__when">When</th>
                  <th>Warning</th>
                  <th className="wr-table__who">Logged by</th>
                </tr>
              </thead>
              <tbody>
                {s.warningsThisWeek.map((w) => (
                  <tr key={w.id}>
                    <td className="wr-table__when">{when(w.date)}</td>
                    <td>
                      {w.description || "(no description)"}
                      {w.action ? ` — action: ${w.action}` : ""}
                    </td>
                    <td className="wr-table__who">{w.createdBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {s.conversation?.response ? (
              <div className="wr-student__logged">
                <strong>Logged response</strong> (
                {s.conversation.loggedBy.split("@")[0]}): {s.conversation.response}
              </div>
            ) : null}

            <div className="wr-student__notes">
              <div className="wr-student__notes-label">
                Follow-up conversation
              </div>
              <div className="wr-rule" />
              <div className="wr-rule" />
              <div className="wr-rule" />
              <div className="wr-sign">
                Spoken with — date ………………………… staff …………………………
              </div>
            </div>
          </section>
        ))
      )}

      <footer className="wr__foot">
        Generated {when(data.meta.pulledAt)} · source: Orah pastoral records (
        {data.meta.categories.join(", ")})
        {data.meta.sensitiveSuppressed > 0
          ? ` · ${data.meta.sensitiveSuppressed} sensitive record(s) withheld`
          : ""}
      </footer>
    </div>
  );
}
