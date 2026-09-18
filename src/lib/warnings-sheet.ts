// Google Sheet backing the weekly Warnings review.
//
// Unlike src/lib/clipboard-sheet.ts — which is a best-effort *mirror* of state
// owned by Vercel KV — this sheet IS the source of truth for conversation
// tick-offs, responses and level overrides. Two consequences:
//
//   1. Write failures must surface to the caller, never be swallowed. If the
//      write didn't land, the state does not exist.
//   2. Reads are cached for READ_TTL seconds under WARNINGS_TAG, and every
//      write busts that tag. That keeps us inside the Sheets read quota
//      (60/min per service account, shared by all dashboard users) while
//      still giving read-after-write consistency. Same pattern as
//      src/lib/sheet-resources.ts + src/lib/launchpad-write.ts.
//
// Auth: the shared service account (GOOGLE_SERVICE_ACCOUNT_EMAIL). The sheet
// must be shared with it as Editor.

import { revalidateTag } from "next/cache";

import { fetchAccessToken, hasServiceAccount } from "@/lib/google-auth";
import type { ConversationEntry, ConversationStatus } from "@/types/warnings";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const READ_TTL = 30; // seconds

export const WARNINGS_TAG = "warnings-log";

function sheetId(): string | undefined {
  return process.env.WARNINGS_SHEET_ID?.trim() || undefined;
}

function logTab(): string {
  return process.env.WARNINGS_LOG_TAB?.trim() || "Conversations";
}

export function isWarningsSheetConfigured(): boolean {
  return Boolean(sheetId() && hasServiceAccount());
}

export function warningsSheetUrl(): string | null {
  const id = sheetId();
  return id ? `https://docs.google.com/spreadsheets/d/${id}` : null;
}

export class WarningsSheetError extends Error {
  constructor(
    public status: number,
    message: string,
    public bodyPreview?: string,
  ) {
    super(message);
    this.name = "WarningsSheetError";
  }
}

function requireConfigured(): string {
  const id = sheetId();
  if (!id) {
    throw new WarningsSheetError(
      503,
      "WARNINGS_SHEET_ID is not configured — conversation logging is disabled.",
    );
  }
  if (!hasServiceAccount()) {
    throw new WarningsSheetError(
      503,
      "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are not configured — conversation logging is disabled.",
    );
  }
  return id;
}

const HEADER = [
  "Key",
  "Student ID",
  "Student",
  "Dorm",
  "Week",
  "Status",
  "Level override",
  "Conversation date",
  "Logged by",
  "Response",
  "Updated at",
];
const LAST_COL = "K"; // 11 columns

function api(id: string, path: string): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`;
}

function range(tab: string, a1: string): string {
  return encodeURIComponent(`${tab}!${a1}`);
}

async function token(): Promise<string> {
  return fetchAccessToken(SHEETS_SCOPE);
}

async function assertOk(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  throw new WarningsSheetError(
    res.status === 403 || res.status === 404 ? res.status : 502,
    `Google Sheets ${what} → ${res.status}`,
    body.slice(0, 300),
  );
}

export function conversationKey(studentId: number, week: string): string {
  return `${studentId}|${week}`;
}

function toRow(e: ConversationEntry): string[] {
  return [
    e.key,
    String(e.studentId),
    e.studentName,
    e.dorm,
    e.week,
    e.status,
    e.levelOverride === null ? "" : String(e.levelOverride),
    e.conversationDate ?? "",
    e.loggedBy,
    e.response,
    e.updatedAt,
  ];
}

// Conversation dates written by the app are full ISO timestamps, but a human
// editing the sheet will type "2026-09-15". Escalation compares these against
// warning timestamps as strings, so widen a bare date to the end of that day:
// warnings logged earlier the same day were part of the conversation, not
// evidence that another one is due.
function normaliseDate(raw: string): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T23:59:59.999Z`;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : raw;
}

function parseRow(row: string[]): ConversationEntry | null {
  const key = (row[0] ?? "").trim();
  if (!key) return null;
  const studentId = Number((row[1] ?? "").trim());
  if (!Number.isFinite(studentId)) return null;

  const rawStatus = (row[5] ?? "").trim().toLowerCase();
  // Anything that isn't explicitly pending counts as done — a human typing
  // "Done", "yes" or "✓" into the sheet means the conversation happened.
  const status: ConversationStatus =
    rawStatus === "pending" || rawStatus === "" ? "pending" : "done";

  const rawOverride = (row[6] ?? "").trim();
  const parsedOverride = rawOverride === "" ? null : Number(rawOverride);
  const levelOverride =
    parsedOverride !== null && Number.isFinite(parsedOverride)
      ? parsedOverride
      : null;

  return {
    key,
    studentId,
    studentName: (row[2] ?? "").trim(),
    dorm: (row[3] ?? "").trim(),
    week: (row[4] ?? "").trim(),
    status,
    levelOverride,
    conversationDate: normaliseDate((row[7] ?? "").trim()),
    loggedBy: (row[8] ?? "").trim(),
    response: row[9] ?? "",
    updatedAt: (row[10] ?? "").trim(),
  };
}

// Read every conversation row. De-duplicates by key, keeping the most
// recently updated — two staff appending for the same student in the same
// tick would otherwise both land.
export async function readConversations(): Promise<ConversationEntry[]> {
  if (!isWarningsSheetConfigured()) return [];
  const id = sheetId()!;

  let accessToken: string;
  try {
    accessToken = await token();
  } catch (err) {
    console.error("[warnings-sheet] auth failed", err);
    return [];
  }

  const res = await fetch(api(id, `/values/${range(logTab(), `A:${LAST_COL}`)}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: READ_TTL, tags: [WARNINGS_TAG] },
  });

  if (res.status === 400 || res.status === 404) {
    // Tab doesn't exist yet — nobody has logged a conversation. Not an error.
    return [];
  }
  await assertOk(res, "values.get");

  const json = (await res.json()) as { values?: string[][] };
  const rows = json.values ?? [];

  const byKey = new Map<string, ConversationEntry>();
  for (let i = 1; i < rows.length; i += 1) {
    const entry = parseRow(rows[i] ?? []);
    if (!entry) continue;
    const existing = byKey.get(entry.key);
    if (!existing || entry.updatedAt >= existing.updatedAt) {
      byKey.set(entry.key, entry);
    }
  }
  return Array.from(byKey.values());
}

async function ensureHeader(id: string, accessToken: string): Promise<void> {
  const url = api(id, `/values/${range(logTab(), `A1:${LAST_COL}1`)}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    // Tab is missing — create it, then write the header.
    await addSheetTab(id, accessToken, logTab());
  } else {
    const json = (await res.json()) as { values?: string[][] };
    if ((json.values?.[0] ?? []).length >= HEADER.length) return;
  }

  const put = await fetch(`${url}?valueInputOption=RAW`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [HEADER] }),
  });
  await assertOk(put, "header write");
}

// 1-indexed sheet row for a key, or null when absent.
async function findRowByKey(
  id: string,
  accessToken: string,
  key: string,
): Promise<number | null> {
  const res = await fetch(api(id, `/values/${range(logTab(), "A:A")}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { values?: string[][] };
  const rows = json.values ?? [];
  for (let i = 1; i < rows.length; i += 1) {
    if ((rows[i]?.[0] ?? "").trim() === key) return i + 1;
  }
  return null;
}

// Insert or replace one conversation row. Throws on failure — the caller
// must not report success unless the sheet actually took the write.
export async function upsertConversation(
  entry: ConversationEntry,
): Promise<ConversationEntry> {
  const id = requireConfigured();
  const accessToken = await token();
  await ensureHeader(id, accessToken);

  const existing = await findRowByKey(id, accessToken, entry.key);
  const values = [toRow(entry)];

  if (existing) {
    const res = await fetch(
      api(
        id,
        `/values/${range(logTab(), `A${existing}:${LAST_COL}${existing}`)}?valueInputOption=RAW`,
      ),
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      },
    );
    await assertOk(res, "values.update");
  } else {
    const res = await fetch(
      api(
        id,
        `/values/${range(logTab(), `A:${LAST_COL}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      ),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      },
    );
    await assertOk(res, "values.append");
  }

  revalidateTag(WARNINGS_TAG);
  return entry;
}

export async function clearConversation(key: string): Promise<void> {
  const id = requireConfigured();
  const accessToken = await token();
  const row = await findRowByKey(id, accessToken, key);
  if (!row) {
    revalidateTag(WARNINGS_TAG);
    return;
  }
  const res = await fetch(
    api(id, `/values/${range(logTab(), `A${row}:${LAST_COL}${row}`)}:clear`),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  await assertOk(res, "values.clear");
  revalidateTag(WARNINGS_TAG);
}

// ─── Weekly report tabs ──────────────────────────────────────────────────

async function addSheetTab(
  id: string,
  accessToken: string,
  title: string,
): Promise<void> {
  const res = await fetch(api(id, ":batchUpdate"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title } } }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Already exists is fine — the caller clears and rewrites it.
    if (res.status === 400 && /already exists/i.test(body)) return;
    throw new WarningsSheetError(
      502,
      `Google Sheets addSheet(${title}) → ${res.status}`,
      body.slice(0, 300),
    );
  }
}

async function clearTab(
  id: string,
  accessToken: string,
  title: string,
): Promise<void> {
  const res = await fetch(
    api(id, `/values/${encodeURIComponent(title)}:clear`),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  // A brand-new tab has nothing to clear.
  if (res.status === 400 || res.status === 404) return;
  await assertOk(res, "report tab clear");
}

export function reportTabTitle(week: string, dorm?: string): string {
  const base = `Week ${week}`;
  const title = dorm && dorm !== "all" ? `${base} · ${dorm}` : base;
  // Sheets caps tab titles at 100 chars.
  return title.slice(0, 100);
}

// Write (or refresh) a dated tab holding one week's review. Re-running for
// the same week overwrites rather than duplicating.
export async function pushWeeklyReportTab(
  week: string,
  dorm: string | undefined,
  rows: string[][],
): Promise<{ tabTitle: string; sheetUrl: string | null }> {
  const id = requireConfigured();
  const accessToken = await token();
  const title = reportTabTitle(week, dorm);

  await addSheetTab(id, accessToken, title);
  await clearTab(id, accessToken, title);

  const res = await fetch(
    api(
      id,
      `/values/${encodeURIComponent(`${title}!A1`)}?valueInputOption=RAW`,
    ),
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    },
  );
  await assertOk(res, "report tab write");

  return { tabTitle: title, sheetUrl: warningsSheetUrl() };
}
