// Optional Google Sheets mirror for clipboard tick-offs. When env vars
// are set, calls to upsertRow/removeRow keep a Google Sheet in sync
// with KV so staff who still consult the sheet see live data. If env
// vars are missing, all functions become no-ops — KV remains the
// source of truth either way.
//
// Auth: a service account whose JSON key has been pasted into env vars.
// Share the target sheet with the service account email (Editor).

import type { ServedEntry } from "@/lib/clipboard-store";

const SHEET_ID = process.env.CLIPBOARD_SHEET_ID;
const SHEET_TAB = process.env.CLIPBOARD_SHEET_TAB || "Served";
const SVC_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SVC_KEY_RAW = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

export function isSheetSyncConfigured(): boolean {
  return Boolean(SHEET_ID && SVC_EMAIL && SVC_KEY_RAW);
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

function svcKey(): string {
  return (SVC_KEY_RAW ?? "").replace(/\\n/g, "\n");
}

// Minimal JWT signing for Google service accounts using SubtleCrypto.
async function fetchAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: SVC_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const pem = svcKey();
  const pkcs8 = pemToPkcs8(pem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const sig = Buffer.from(sigBuf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const jwt = `${unsigned}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(Buffer.from(body, "base64")).buffer;
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
    const token = await fetchAccessToken();
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
    const token = await fetchAccessToken();
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
