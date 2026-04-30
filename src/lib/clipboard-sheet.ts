// Optional Google Sheets mirror for clipboard tick-offs. When env vars
// are set, calls to upsertRow/removeRow keep a Google Sheet in sync
// with KV so staff who still consult the sheet see live data. If env
// vars are missing, all functions become no-ops — KV remains the
// source of truth either way.
//
// Auth: a service account whose JSON key has been pasted into env vars.
// Share the target sheet with the service account email (Editor).

import type { ServedEntry } from "@/lib/clipboard-store";
import { fetchAccessToken, hasServiceAccount } from "@/lib/google-auth";

const SHEET_ID = process.env.CLIPBOARD_SHEET_ID;
const SHEET_TAB = process.env.CLIPBOARD_SHEET_TAB || "Served";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function isSheetSyncConfigured(): boolean {
  return Boolean(SHEET_ID && hasServiceAccount());
}

const HEADER = [
  "Record ID",
  "Weekend",
  "Student",
  "Dorm",
  "Category",
  "Record date",
  "Served by",
  "Served at",
  "Note",
];

async function getToken(): Promise<string> {
  return fetchAccessToken(SHEETS_SCOPE);
}

async function ensureHeader(token: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_TAB + "!A1:I1")}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return; // Tab may not exist; skip silently.
  const json = (await res.json()) as { values?: string[][] };
  const first = json.values?.[0] ?? [];
  if (first.length >= HEADER.length) return;
  await fetch(`${url}?valueInputOption=RAW`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [HEADER] }),
  });
}

async function findRowByRecordId(
  token: string,
  recordId: number,
): Promise<number | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_TAB + "!A:A")}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { values?: string[][] };
  const target = String(recordId);
  const rows = json.values ?? [];
  for (let i = 1; i < rows.length; i += 1) {
    if ((rows[i]?.[0] ?? "") === target) return i + 1; // 1-indexed
  }
  return null;
}

function toRow(weekendISO: string, e: ServedEntry): string[] {
  return [
    String(e.recordId),
    weekendISO,
    e.studentName ?? "",
    e.dorm ?? "",
    e.category ?? "",
    e.recordDate ?? "",
    e.servedBy,
    e.servedAt,
    e.note ?? "",
  ];
}

export async function upsertRow(
  weekendISO: string,
  entry: ServedEntry,
): Promise<void> {
  if (!isSheetSyncConfigured()) return;
  try {
    const token = await getToken();
    await ensureHeader(token);
    const existingRow = await findRowByRecordId(token, entry.recordId);
    const values = [toRow(weekendISO, entry)];
    if (existingRow) {
      const range = `${SHEET_TAB}!A${existingRow}:I${existingRow}`;
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values }),
        },
      );
    } else {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_TAB + "!A:I")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values }),
        },
      );
    }
  } catch (err) {
    // Surface errors to logs but never break the user-facing API call.
    console.error("[clipboard-sheet] upsert failed", err);
  }
}

export async function removeRow(recordId: number): Promise<void> {
  if (!isSheetSyncConfigured()) return;
  try {
    const token = await getToken();
    const row = await findRowByRecordId(token, recordId);
    if (!row) return;
    const range = `${SHEET_TAB}!A${row}:I${row}`;
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:clear`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  } catch (err) {
    console.error("[clipboard-sheet] remove failed", err);
  }
}
