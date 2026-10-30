"use client";
import { useEffect, useMemo, useState } from "react";
import { buildDemoAnalytics, demoHouses } from "@/lib/demo/analytics";

export function DemoReports() {
  const [dorm, setDorm] = useState("9001");
  const [warnings, setWarnings] = useState(true);
  const [analytics, setAnalytics] = useState(true);
  const [recipients, setRecipients] = useState(
    "dorm-head@example.invalid\npastoral-lead@example.invalid",
  );
  const [printing, setPrinting] = useState(false);
  const data = useMemo(
    () => buildDemoAnalytics("2026-10-19", "2026-10-25", dorm),
    [dorm],
  );
  const due = data.warnings!.students.filter((s) => s.dueNow);
  const metrics = data.watch!.metrics;
  const dormName = demoHouses.find((h) => String(h.id) === dorm)!.name;
  useEffect(() => {
    const reset = () => setPrinting(false);
    window.addEventListener("afterprint", reset);
    return () => window.removeEventListener("afterprint", reset);
  }, []);
  useEffect(() => {
    if (printing) window.print();
  }, [printing]);
  return (
    <div className="app an-app an-demo-report-app">
      <details
        className="an-demo-report"
        id="demo-weekly-reports"
        data-print={printing}
      >
        <summary className="an-no-print">Try a weekly report preview</summary>
        <div className="an-no-print">
          <p>
            Example administrator controls. Choose a fictional dorm, add
            multiple example recipients, and choose what goes in its weekly
            report. Changes stay in this tab and reset on reload. No emails are
            sent.
          </p>
          <div className="an-toolbar">
            <label>
              Report dorm
              <select
                aria-label="Report dorm"
                value={dorm}
                onChange={(e) => setDorm(e.target.value)}
              >
                {demoHouses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <p>Example schedule: Monday · previous completed week</p>
          </div>
          <label htmlFor="demo-recipients">
            Example recipients (one per line)
          </label>
          <textarea
            id="demo-recipients"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <div className="an-demo-checks">
            <label>
              <input
                type="checkbox"
                checked={warnings}
                onChange={(e) => setWarnings(e.target.checked)}
              />
              Warnings report
            </label>
            <label>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
              />
              Analytics & charts
            </label>
          </div>
          <p role="status">
            Preview only ·{" "}
            {recipients.split(/[\n,;]+/).filter((v) => v.trim()).length} example
            recipients · No sending or saving
          </p>
          <button
            className="btn btn--primary btn--sm"
            disabled={!warnings && !analytics}
            onClick={() => setPrinting(true)}
          >
            Print example report
          </button>
        </div>
        <article aria-label="Example weekly report">
          <p className="an-demo-banner">
            <strong>DEMO · Fictional data only</strong>
            <br />
            Example report for 19–25 October 2026 · {dormName}
          </p>
          <h2>Weekly student-life review</h2>
          <p>
            Connect the week’s activity to the next conversation and the next
            follow-up.
          </p>
          {!warnings && !analytics && (
            <p>Select at least one report section to preview.</p>
          )}
          {warnings && (
            <section>
              <h3>Warnings needing follow-up</h3>
              <p>
                {due.length} fictional students have reached the conversation
                threshold. The sample includes carry-forward warnings.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Fictional student</th>
                      <th>Level</th>
                      <th>Since conversation</th>
                      <th>Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {due.map((s) => (
                      <tr key={s.studentId}>
                        <td>{s.name}</td>
                        <td>{s.effectiveLevel}</td>
                        <td>{s.warningsSinceLastConversation}</td>
                        <td>Conversation due</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!due.length && <p>No conversations due in this sample.</p>}
            </section>
          )}
          {analytics && (
            <section>
              <h3>Consequences and rest</h3>
              <p>
                {metrics.served} consequences recorded as served ·{" "}
                {metrics.open.length} outstanding at cutoff · {metrics.overdue}{" "}
                beyond their example target.
              </p>
              <p>
                Median time to serve:{" "}
                {metrics.medianMinHours == null
                  ? "Not measured"
                  : `${metrics.medianMinHours.toFixed(1)}–${metrics.medianMaxHours!.toFixed(1)} hours`}
                . Removal from the watchlist represents consequence served;
                timing is bounded by observations.
              </p>
              <p>
                {data.rest!.summary.students} students with rest activity ·{" "}
                {data.rest!.summary.totalHours.toFixed(1)} hours from paired
                in/out records. Inferred departures do not enter duration
                totals.
              </p>
              <h3>Activity by category</h3>
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Records</th>
                    <th>Comparison</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pastoral!.categories.map((c) => (
                    <tr key={c.label}>
                      <td>{c.label}</td>
                      <td>{c.count}</td>
                      <td style={{ width: "35%" }}>
                        <div
                          className="an-demo-bar"
                          style={{
                            width: `${(c.count / Math.max(1, ...data.pastoral!.categories.map((v) => v.count))) * 100}%`,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="an-muted">
                Counts describe recorded activity, not student wellbeing or dorm
                quality. Read them alongside staff context and data
                completeness.
              </p>
            </section>
          )}
        </article>
      </details>
    </div>
  );
}
