import type { Count, ReportData } from "./types";
export const escapeHtml = (s: unknown): string =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
const cell = (s: unknown) =>
  `<td style="padding:9px;border-bottom:1px solid #dde3df;vertical-align:top">${escapeHtml(s)}</td>`;
function table(headers: string[], rows: unknown[][]): string {
  return `<table width="100%" style="border-collapse:collapse;font-size:13px"><thead><tr>${headers.map((h) => `<th style="text-align:left;padding:9px;background:#edf2ef">${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map(cell).join("")}</tr>`).join("")}</tbody></table>`;
}
function bars(title: string, rows: Count[]): string {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return `<h3>${escapeHtml(title)}</h3>${rows.length ? `<table width="100%" style="border-collapse:collapse" aria-label="${escapeHtml(title)}">${rows.map((r) => `<tr><td style="width:38%;padding:5px 8px 5px 0;font-size:13px">${escapeHtml(r.label)}</td><td>${r.count > 0 ? `<table width="${Math.round((r.count / max) * 100)}%" style="background:#285b4a;height:12px"><tr><td></td></tr></table>` : ""}</td><td style="width:45px;text-align:right">${r.count}</td></tr>`).join("")}</table>` : "<p>No matching records.</p>"}`;
}
export function renderReport(
  data: ReportData,
  url: string,
  compact = false,
): string {
  const e = escapeHtml;
  let body = `<p style="letter-spacing:2px;text-transform:uppercase;font-size:11px;color:#52695f">Leysin American School · Weekly dorm review</p><h1 style="font-size:30px;margin:12px 0">${e(data.dorm)}</h1><p style="font-size:18px">${e(data.name)} · ${e(data.label)}</p>`;
  if (compact)
    body += `<p><a href="${e(url)}" style="color:#285b4a">Open the full printable report</a> · sign in with your school account.</p>`;
  else
    body += `<p class="no-print">Use Print (⌘P / Ctrl-P) to print or save as PDF. <a href="/live">Open dashboard to log follow-ups</a></p>`;
  if (data.warnings) {
    const w = data.warnings;
    const due = w.students.filter((s) => s.dueNow);
    const total = w.students.reduce((n, s) => n + s.warningsThisWeek.length, 0);
    body += `<h2>Warnings &amp; follow-up</h2><p><strong>${total}</strong> warning${total === 1 ? "" : "s"} this week · <strong>${due.length}</strong> student${due.length === 1 ? "" : "s"} due for follow-up · threshold ${w.meta.threshold}</p>`;
    body += table(
      ["Student", "Level", "This week", "Unaddressed", "Follow-up at week end"],
      w.students.map((s) => [
        s.name,
        s.effectiveLevel,
        s.warningsThisWeek.length,
        s.warningsSinceLastConversation,
        s.dueNow
          ? s.warningsThisWeek.length
            ? "Conversation due"
            : "Carried forward — conversation due"
          : s.conversation?.status === "done"
            ? "Conversation logged"
            : "Below follow-up threshold",
      ]),
    );
    if (!w.students.length)
      body +=
        "<p>No warnings this week or outstanding follow-ups in the configured term window.</p>";
    if (!compact)
      for (const s of w.students) {
        body += `<section style="break-inside:avoid"><h3>${e(s.name)} · Level ${s.effectiveLevel}</h3><p>${s.termWarningCount} warnings in the term window${s.lastConversationAt ? ` · last conversation ${e(when(s.lastConversationAt))}` : " · no conversation logged"}</p>`;
        body += s.warningsThisWeek.length
          ? table(
              ["Date", "Warning", "Logged by"],
              s.warningsThisWeek.map((r) => [
                when(r.date),
                `${r.description}${r.action ? ` — action: ${r.action}` : ""}`,
                r.createdBy,
              ]),
            )
          : "<p>Outstanding warnings from earlier weeks. Review the student's history in the dashboard.</p>";
        if (s.conversation?.response)
          body += `<p><strong>Logged response:</strong> ${e(s.conversation.response)}</p>`;
        body += `<p style="border-bottom:1px solid #aab9b1;padding:12px 0">Follow-up notes: ____________________________________________________</p></section>`;
      }
    body += `<p style="font-size:12px;color:#52695f">Levels and conversations reflect the end of this week. Carry-forward is limited to the configured term window starting ${e(w.meta.termStartISO.slice(0, 10))}. Later conversations appear in subsequent reports.</p>`;
  }
  if (data.analytics) {
    const a = data.analytics;
    body += `<h2>Dorm analytics</h2><p><strong>${a.total}</strong> pastoral records · <strong>${a.uniqueStudents}</strong> students · <strong>${a.restCheckins}</strong> rest/health-center check-ins (${a.restingStudents} students)</p>`;
    if (a.restSummary) {
      const r = a.restSummary;
      body += `<h3>Recorded rest intervals</h3><p>${r.students} distinct students with activity · ${r.paired} paired visits · ${r.totalHours.toFixed(1)} paired hours overlapping this week · median completed visit ${r.medianMinutes === null ? "unavailable" : `${Math.round(r.medianMinutes)} minutes`}.</p><p>${r.inferred} inferred departures and ${r.incomplete} incomplete visits excluded from duration totals. Historical reconstruction looks back 31 days. Location intervals are not confirmed pass durations.</p>`;
    }
    if (data.watchlist) {
      const w = data.watchlist.metrics;
      const duration = (lo: number | null, hi: number | null) =>
        lo === null || hi === null
          ? "Not yet measured"
          : `${lo.toFixed(1)}–${hi.toFixed(1)} hours`;
      body += `<h3>Time to consequence served</h3><p>Watchlist addition to manual removal. Last successful observation: ${e(when(data.watchlist.observedAt))}.</p>`;
      body += table(
        ["Measure", "Observed result"],
        [
          [
            "Median time to serve",
            duration(w.medianMinHours, w.medianMaxHours),
          ],
          [
            "Average time to serve",
            duration(w.averageMinHours, w.averageMaxHours),
          ],
          ["Completed episodes with bounded starts", w.measured],
          [
            "Within current target (classifiable cases only)",
            w.withinPercent === null
              ? "Not yet measured"
              : `${w.withinPercent}% (${w.within} within; ${w.late} late; ${w.uncertain} uncertain; ${w.targetUnknown} unmeasured)`,
          ],
          ["Outstanding at cutoff (observed status)", w.open.length],
          ["Definitely beyond target", w.overdue],
          ["Newly flagged / served in period", `${w.added} / ${w.served}`],
          ["Possible expirations excluded", w.expiryPossible],
        ],
      );
    }
    if (data.watchlistNote)
      body += `<p style="font-size:12px;color:#52695f">${e(data.watchlistNote)}</p>`;
    body +=
      bars("Pastoral records by category", a.categories) +
      bars("Pastoral records by day", a.daily) +
      bars("Eight-week trend · pastoral records", a.trend);
    if (!compact)
      body += `<h3>Rest &amp; health-center activity</h3>${
        a.restEvents.length
          ? table(
              ["Student", "Recorded at (Swiss time)", "Location", "Event"],
              a.restEvents.map((r) => [
                r.name,
                when(r.when),
                r.location,
                r.action,
              ]),
            )
          : "<p>No matching check-ins or check-outs recorded this week.</p>"
      }`;
    body += `<p style="font-size:12px;color:#52695f">Scope: ${data.expanded ? "all non-sensitive pastoral categories available through the existing Orah integration" : "dashboard warning, early check-in, weekend infraction and no-PA categories"}. Check-in totals count movements in this week; paired rest hours use the separate interval calculation above. Counts use students’ current dorm assignments and are not adjusted for dorm size. Zero means no matching records were returned, not proof that no events occurred.</p>`;
  }
  body += `<hr style="border:0;border-top:1px solid #dde3df;margin-top:30px"><p style="font-size:11px;color:#52695f">Confidential · intended recipients only. Generated ${e(when(data.generatedAt))}. Sensitive pastoral records are excluded. Snapshot retained for 90 days.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(data.dorm)} weekly review</title><style>@media print{.no-print{display:none}body{background:white!important}thead{display:table-header-group}tr{break-inside:avoid}h2,h3{break-after:avoid}}</style></head><body style="margin:0;padding:24px;background:#f4f5f1;color:#213e32;font-family:Arial,sans-serif;line-height:1.5"><main style="max-width:900px;margin:auto;padding:28px;background:white">${body}</main></body></html>`;
}
export function renderText(data: ReportData, url: string): string {
  const lines = [`${data.dorm} — ${data.name}`, data.label];
  if (data.warnings) {
    lines.push("Warnings and follow-up at week end:");
    for (const s of data.warnings.students)
      lines.push(
        `${s.name}: Level ${s.effectiveLevel}; ${s.warningsThisWeek.length} this week; ${s.warningsSinceLastConversation} unaddressed; ${s.dueNow ? "CONVERSATION DUE" : s.conversation?.status === "done" ? "conversation logged" : "below follow-up threshold"}`,
      );
  }
  if (data.analytics) {
    lines.push(
      `Pastoral records: ${data.analytics.total}; rest/health-center check-ins: ${data.analytics.restCheckins}`,
    );
    for (const c of data.analytics.categories)
      lines.push(`${c.label}: ${c.count}`);
    lines.push(
      "Eight-week trend:",
      ...data.analytics.trend.map((c) => `${c.label}: ${c.count}`),
    );
    const rest = data.analytics.restSummary;
    if (rest)
      lines.push(
        `Paired rest hours: ${rest.totalHours.toFixed(1)}; ${rest.paired} paired visits; ${rest.incomplete} incomplete; ${rest.inferred} inferred departures excluded.`,
      );
    if (data.watchlist) {
      const w = data.watchlist.metrics;
      lines.push(
        `Consequences: ${w.added} additions observed; ${w.served} removals counted as served; ${w.open.length} outstanding at cutoff; ${w.overdue} definitely beyond target.`,
        `Median elapsed hours: ${w.medianMinHours === null ? "unavailable" : `${w.medianMinHours.toFixed(1)}–${w.medianMaxHours!.toFixed(1)}`}; ${w.measured} bounded episodes. Last observation: ${when(data.watchlist.observedAt)}.`,
      );
    }
    if (data.watchlistNote) lines.push(data.watchlistNote);
  }
  return [
    ...lines,
    `Printable report (school sign-in required): ${url}`,
    "Confidential. Sensitive pastoral records excluded. Rest durations use paired location events, not confirmed pass durations.",
  ].join("\n");
}
