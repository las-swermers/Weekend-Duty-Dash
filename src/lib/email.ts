// Resend wrapper + snapshot template. The render functions are intentionally
// inline-styled tables — email clients are picky and external CSS is a
// reliable way to break Outlook.

import { Resend } from "resend";

let cachedClient: Resend | null = null;

function client(): Resend {
  if (cachedClient) return cachedClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  cachedClient = new Resend(key);
  return cachedClient;
}

export interface SnapshotPerson {
  name: string;
  dorm?: string;
}

export interface SnapshotTravel extends SnapshotPerson {
  status: string;
}

export interface SnapshotTrip extends SnapshotPerson {
  trip: string;
}

export interface SnapshotResource {
  name: string;
  url: string;
  category: string;
}

export interface SnapshotData {
  weekendOf: string;
  healthCenter: SnapshotPerson[];
  noPa: SnapshotPerson[];
  travelRequests: SnapshotTravel[];
  scheduledTrips: SnapshotTrip[];
  resources: SnapshotResource[];
  dashboardUrl: string;
  sentBy: string;
}

export async function sendSnapshot(
  to: string[],
  data: SnapshotData,
): Promise<void> {
  const html = renderSnapshotHtml(data);
  const text = renderSnapshotText(data);

  await client().emails.send({
    from: process.env.EMAIL_FROM ?? "dashboard@las.ch",
    to,
    subject: `Weekend Duty Snapshot — ${data.weekendOf}`,
    html,
    text,
  });
}

function row(p: SnapshotPerson, suffix?: string): string {
  const dorm = p.dorm ? `<span style="color:#5b7388"> · ${p.dorm}</span>` : "";
  const tail = suffix ? `<span style="color:#5b7388"> · ${suffix}</span>` : "";
  return `<li style="padding:6px 0;border-bottom:1px dashed #d8d3c8">${p.name}${dorm}${tail}</li>`;
}

function section(title: string, items: string[]): string {
  if (items.length === 0) {
    return `
      <h3 style="font-family:Archivo,Helvetica,sans-serif;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;color:#093554;margin:24px 0 8px">${title}</h3>
      <p style="margin:0;color:#8ea0b1;font-size:13px">None.</p>`;
  }
  return `
    <h3 style="font-family:Archivo,Helvetica,sans-serif;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;color:#093554;margin:24px 0 8px">${title}</h3>
    <ul style="margin:0;padding:0;list-style:none;color:#093554;font-size:14px">${items.join("")}</ul>`;
}

function renderSnapshotHtml(d: SnapshotData): string {
  const hc = d.healthCenter.map((p) => row(p));
  const nopa = d.noPa.map((p) => row(p));
  const travel = d.travelRequests.map((p) => row(p, p.status));
  const trips = d.scheduledTrips.map((p) => row(p, p.trip));
  const resources = d.resources
    .map(
      (r) =>
        `<li style="padding:4px 0"><a href="${r.url}" style="color:#d43b1b;text-decoration:none">${r.name}</a> <span style="color:#8ea0b1;font-size:12px">· ${r.category}</span></li>`,
    )
    .join("");

  return `<!doctype html>
<html><body style="margin:0;background:#fafaf7;color:#093554;font-family:Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf7">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fafaf7;max-width:600px;border-top:1px solid #093554;border-bottom:1px solid #093554">
        <tr><td style="padding:24px">
          <p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#5b7388;margin:0 0 6px">Leysin American School · Weekend Duty</p>
          <h1 style="font-family:Archivo,Helvetica,sans-serif;font-size:28px;line-height:1.05;margin:0;color:#093554">Weekend Duty <span style="color:#d43b1b">Snapshot</span></h1>
          <p style="font-size:13px;color:#5b7388;margin:6px 0 0">${d.weekendOf} · sent by ${d.sentBy}</p>

          ${section("Health Center", hc)}
          ${section("No physical activity", nopa)}
          ${section("Travel requests", travel)}
          ${section("Scheduled trips", trips)}

          <h3 style="font-family:Archivo,Helvetica,sans-serif;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;color:#093554;margin:24px 0 8px">Launchpad</h3>
          <ul style="margin:0;padding:0;list-style:none">${resources}</ul>

          <p style="margin:32px 0 0;font-size:12px;color:#8ea0b1">
            <a href="${d.dashboardUrl}" style="color:#093554">Open the live dashboard →</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function renderSnapshotText(d: SnapshotData): string {
  const lines: string[] = [];
  lines.push(`Weekend Duty Snapshot — ${d.weekendOf}`);
  lines.push(`Sent by ${d.sentBy}`);
  lines.push("");

  const block = (title: string, items: string[]) => {
    lines.push(title.toUpperCase());
    if (items.length === 0) lines.push("  none");
    else for (const it of items) lines.push(`  - ${it}`);
    lines.push("");
  };

  block(
    "Health Center",
    d.healthCenter.map((p) => `${p.name}${p.dorm ? ` (${p.dorm})` : ""}`),
  );
  block(
    "No physical activity",
    d.noPa.map((p) => `${p.name}${p.dorm ? ` (${p.dorm})` : ""}`),
  );
  block(
    "Travel requests",
    d.travelRequests.map(
      (p) => `${p.name}${p.dorm ? ` (${p.dorm})` : ""} — ${p.status}`,
    ),
  );
  block(
    "Scheduled trips",
    d.scheduledTrips.map(
      (p) => `${p.name}${p.dorm ? ` (${p.dorm})` : ""} — ${p.trip}`,
    ),
  );
  block(
    "Launchpad",
    d.resources.map((r) => `${r.name} (${r.category}): ${r.url}`),
  );

  lines.push(`Dashboard: ${d.dashboardUrl}`);
  return lines.join("\n");
}
