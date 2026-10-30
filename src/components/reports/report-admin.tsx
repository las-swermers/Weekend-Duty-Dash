"use client";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import type { RunSummary, Subscription } from "@/lib/reports/types";
interface Settings {
  subscriptions: Subscription[];
  houses: { id: number; name: string }[];
  history: RunSummary[];
  previousWeek: string;
  readiness: {
    storage: boolean;
    email: boolean;
    enabled: boolean;
    warnings: boolean;
  };
}
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
async function request(url: string, method = "GET", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.redirected)
    throw new Error("Your session expired. Reload and sign in again.");
  const data = await res
    .json()
    .catch(() => ({ error: "The service returned an unexpected response." }));
  if (!res.ok || data.error) throw new Error(data.error ?? "Request failed.");
  return data;
}
function Editor({
  initial,
  houses,
  fresh,
  onSaved,
  onDeleted,
  onPreview,
  week,
}: {
  initial: Subscription;
  houses: Settings["houses"];
  fresh?: boolean;
  week: string;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onPreview: (url: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [recipients, setRecipients] = useState(initial.recipients.join("\n"));
  const [dirty, setDirty] = useState(Boolean(fresh));
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  function update(patch: Partial<Subscription>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setMessage("");
  }
  async function act(action: "save" | "preview" | "test" | "delete") {
    setBusy(action);
    setMessage("");
    try {
      if (action === "save") {
        await request("/api/admin/reports", "PUT", { ...draft, recipients });
        setDirty(false);
        await onSaved();
      } else if (action === "delete") {
        await request("/api/admin/reports", "DELETE", { id: draft.id });
        await onDeleted();
      } else {
        const result = await request(`/api/admin/reports/${action}`, "POST", {
          id: draft.id,
          week,
        });
        if (action === "preview") {
          onPreview(result.url);
          setMessage("Preview ready below. No email sent.");
        } else
          setMessage(
            "Test email accepted by the email provider for your admin address.",
          );
        await onSaved();
      }
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not complete action.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="report-card">
      <div className="report-card-head">
        <h2>{initial.name || "New subscription"}</h2>
        <span
          className={`report-status ${initial.enabled ? "is-enabled" : ""}`}
        >
          {initial.enabled ? "Scheduled" : "Paused"}
        </span>
      </div>
      <div className="report-fields">
        <label>
          Report name
          <input
            value={draft.name}
            maxLength={100}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Savoy weekly review"
          />
        </label>
        <label>
          Dorm
          <select
            value={draft.dormId}
            onChange={(e) => update({ dormId: Number(e.target.value) })}
          >
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label className="report-wide">
          Recipients
          <textarea
            rows={3}
            value={recipients}
            onChange={(e) => {
              setRecipients(e.target.value);
              setDirty(true);
              setMessage("");
            }}
            placeholder="colleague@las.ch, dorm-head@las.ch"
          />
          <small>
            School addresses only. Separate with commas or new lines; up to 25
            per report.
          </small>
        </label>
      </div>
      <fieldset>
        <legend>Include in this report</legend>
        <label className="report-check">
          <input
            type="checkbox"
            checked={draft.warnings}
            onChange={(e) => update({ warnings: e.target.checked })}
          />
          <span>
            <strong>Warnings &amp; follow-up</strong>
            <small>
              Levels, conversations logged and outstanding follow-ups from
              earlier weeks.
            </small>
          </span>
        </label>
        <label className="report-check">
          <input
            type="checkbox"
            checked={draft.analytics}
            onChange={(e) =>
              update({
                analytics: e.target.checked,
                expanded: e.target.checked && draft.expanded,
              })
            }
          />
          <span>
            <strong>Dorm analytics</strong>
            <small>
              Category and daily charts, an eight-week trend, and recorded
              rest/health-center activity.
            </small>
          </span>
        </label>
        <label className="report-check">
          <input
            type="checkbox"
            checked={draft.expanded}
            disabled={!draft.analytics}
            onChange={(e) => update({ expanded: e.target.checked })}
          />
          <span>
            <strong>Broader pastoral overview</strong>
            <small>
              Include all non-sensitive Orah pastoral categories, beyond those
              shown on the duty dashboard.
            </small>
          </span>
        </label>
      </fieldset>
      <div className="report-fields">
        <label>
          Weekly delivery day
          <select
            value={draft.weekday}
            onChange={(e) => update({ weekday: Number(e.target.value) })}
          >
            {days.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="report-check">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          <span>
            <strong>Enable weekly email</strong>
            <small>Save to apply this change.</small>
          </span>
        </label>
      </div>
      <p className="report-muted">
        Covers the previous completed Monday–Sunday week. Delivery runs in the
        morning: 07:00 winter / 08:00 summer Swiss time, within the hour.
      </p>
      <div className="report-actions">
        <button
          className="btn btn--primary"
          disabled={Boolean(busy) || !dirty}
          onClick={() => act("save")}
        >
          {busy === "save" ? "Saving…" : "Save subscription"}
        </button>
        <button
          className="btn btn--ghost"
          disabled={Boolean(busy) || dirty || fresh}
          onClick={() => act("preview")}
        >
          {busy === "preview" ? "Generating…" : "Preview report"}
        </button>
        <button
          className="btn btn--ghost"
          disabled={Boolean(busy) || dirty || fresh}
          onClick={() => act("test")}
        >
          {busy === "test" ? "Sending…" : "Send test to me"}
        </button>
        {!fresh && (
          <button
            className="btn btn--ghost"
            disabled={Boolean(busy)}
            onClick={() => act("delete")}
          >
            Delete subscription
          </button>
        )}
      </div>
      {dirty && (
        <p className="report-muted">
          Save changes before previewing or sending a test.
        </p>
      )}
      {message && (
        <p role="status" className="report-notice">
          {message}
        </p>
      )}
    </section>
  );
}
export function ReportAdmin({ email }: { email: string }) {
  const { data, error, mutate, isLoading } = useSWR<Settings>(
    "/api/admin/reports",
    (url) => request(url),
    { revalidateOnFocus: false },
  );
  const [fresh, setFresh] = useState<Subscription | null>(null);
  const [preview, setPreview] = useState("");
  const [week, setWeek] = useState("");
  const [notice, setNotice] = useState("");
  const [retrying, setRetrying] = useState("");
  async function reload() {
    await mutate();
  }
  function add() {
    const h =
      data?.houses.find((h) => h.name.toLowerCase() === "savoy") ??
      data?.houses[0];
    if (!h) return;
    setFresh({
      id: crypto.randomUUID(),
      name: `${h.name} weekly review`,
      dormId: h.id,
      dormName: h.name,
      recipients: [],
      warnings: true,
      analytics: false,
      expanded: false,
      weekday: 1,
      enabled: false,
      updatedAt: "",
      updatedBy: email,
    });
  }
  async function retry(id: string) {
    setRetrying(id);
    setNotice("");
    try {
      await request("/api/admin/reports/retry", "POST", { id });
      setNotice("Retry finished. Check provider acceptance below.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setRetrying("");
      await mutate();
    }
  }
  return (
    <main className="report-admin">
      <header className="report-heading">
        <div>
          <p className="report-eyebrow">LAS · Site administration</p>
          <h1>
            Weekly <em>reports</em>
          </h1>
          <p>Give each dorm the information it needs for the week ahead.</p>
        </div>
        <Link href="/live" className="btn btn--ghost">
          ← Dashboard
        </Link>
      </header>
      <div className="report-intro">
        <strong>Recipients, reports, and follow-up in one place</strong>
        <p>
          Create a separate subscription for each dorm or audience. Each
          recipient gets their own email with charts and a link to a printable
          report. Test emails go only to {email}.
        </p>
      </div>
      {isLoading && <p>Loading report settings…</p>}
      {error && (
        <p role="alert" className="report-notice">
          {error.message}{" "}
          <button className="btn btn--ghost" onClick={() => mutate()}>
            Try again
          </button>
        </p>
      )}
      {data && (
        <>
          {(!data.readiness.storage ||
            !data.readiness.email ||
            !data.readiness.enabled ||
            !data.readiness.warnings) && (
            <div className="report-notice">
              <strong>Setup status</strong>
              <ul>
                {!data.readiness.storage && (
                  <li>
                    Report storage needs connecting before settings can be
                    saved.
                  </li>
                )}
                {!data.readiness.email && (
                  <li>Email sender configuration is incomplete.</li>
                )}
                {!data.readiness.enabled && (
                  <li>
                    Email delivery is off. Previews remain available once
                    storage is connected.
                  </li>
                )}
                {!data.readiness.warnings && (
                  <li>
                    The conversation sheet needs connecting before warnings
                    reports can be generated.
                  </li>
                )}
              </ul>
            </div>
          )}
          <div className="report-toolbar">
            <div>
              <h2>Report subscriptions</h2>
              <p className="report-muted">New subscriptions start paused.</p>
            </div>
            <button
              className="btn btn--primary"
              disabled={
                Boolean(fresh) || !data.readiness.storage || !data.houses.length
              }
              onClick={add}
            >
              + Add report
            </button>
          </div>
          <label className="report-week">
            Week for previews and tests (Monday)
            <input
              type="date"
              value={week || data.previousWeek}
              max={data.previousWeek}
              onChange={(e) => setWeek(e.target.value)}
            />
          </label>
          {fresh && (
            <>
              <Editor
                initial={fresh}
                houses={data.houses}
                fresh
                week={week || data.previousWeek}
                onSaved={async () => {
                  setFresh(null);
                  await reload();
                }}
                onDeleted={reload}
                onPreview={setPreview}
              />
              <button className="btn btn--ghost" onClick={() => setFresh(null)}>
                Cancel new report
              </button>
            </>
          )}
          {data.subscriptions.map((s) => (
            <Editor
              key={`${s.id}-${s.updatedAt}`}
              initial={s}
              houses={data.houses}
              week={week || data.previousWeek}
              onSaved={reload}
              onDeleted={reload}
              onPreview={setPreview}
            />
          ))}
          {!data.subscriptions.length && !fresh && (
            <section className="report-card">
              <h3>Start with Savoy</h3>
              <p>
                Add a report, enter your recipients, and preview last week’s
                warnings. You can add analytics to the same email or create a
                separate subscription.
              </p>
            </section>
          )}
          {preview && (
            <section className="report-card">
              <div className="report-card-head">
                <h2>Report preview</h2>
                <a
                  className="btn btn--ghost"
                  href={preview}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open to print / save PDF ↗
                </a>
              </div>
              <iframe
                title="Weekly dorm report preview"
                src={preview}
                className="report-preview"
              />
            </section>
          )}
          <section className="report-card">
            <h2>Recent report activity</h2>
            <p className="report-muted">
              “Accepted” means the email provider accepted the message. It does
              not confirm inbox delivery. Reports expire after 90 days.
            </p>
            {notice && (
              <p role="status" className="report-notice">
                {notice}
              </p>
            )}
            {!data.history.length ? (
              <p>No reports generated yet.</p>
            ) : (
              <div className="report-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Week of</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{r.week}</td>
                        <td>{r.kind}</td>
                        <td>
                          {r.kind === "preview"
                            ? "Preview only"
                            : `${r.accepted}/${r.total} accepted`}
                          {r.errors.map((e, i) => (
                            <p className="report-error" key={i}>
                              {e}
                            </p>
                          ))}
                        </td>
                        <td>
                          {r.snapshotAvailable && (
                            <a
                              href={`/api/reports/${r.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                            </a>
                          )}
                          {r.kind !== "preview" && r.accepted < r.total && (
                            <button
                              className="btn btn--ghost btn--sm"
                              disabled={Boolean(retrying)}
                              onClick={() => retry(r.id)}
                            >
                              {retrying === r.id
                                ? "Retrying…"
                                : "Retry unconfirmed"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
