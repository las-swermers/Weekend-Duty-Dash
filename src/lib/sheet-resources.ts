// Google Sheets-backed launchpad resources.
//
// When LAUNCHPAD_SHEET_CSV_URL is set, the launchpad reads its tile list
// from a Google Sheet rather than from Vercel KV. The sheet must be
// either published to web, or shared as "anyone with the link can view"
// (or with the @las.ch Workspace domain) so the CSV export endpoint
// returns the data without auth.
//
// Expected sheet shape (header row required, case-insensitive):
//   name | url | icon | order
//
// Example CSV URL:
//   https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=csv&gid=0

import type { Resource } from "@/types/resource";
import { LAUNCHPAD_SHEET_TAG } from "@/lib/launchpad-write";
import { slugify } from "@/lib/utils";

export class SheetResourcesError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "SheetResourcesError";
  }
}

export function isSheetMode(): boolean {
  return Boolean(process.env.LAUNCHPAD_SHEET_CSV_URL?.trim());
}

export function sheetEditUrl(): string | null {
  return process.env.LAUNCHPAD_SHEET_EDIT_URL?.trim() || null;
}

// Minimal CSV parser. Handles quoted fields, escaped quotes ("") inside
// quotes, and CRLF line endings.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      current.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== "" || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows.filter((row) => row.some((c) => c.trim() !== ""));
}

function normaliseHeader(s: string): string {
  return s.trim().toLowerCase();
}

export async function fetchSheetResources(): Promise<Resource[]> {
  const url = process.env.LAUNCHPAD_SHEET_CSV_URL?.trim();
  if (!url) {
    throw new SheetResourcesError(500, "LAUNCHPAD_SHEET_CSV_URL not configured");
  }

  const res = await fetch(url, {
    headers: { Accept: "text/csv,text/plain,*/*" },
    next: { revalidate: 300, tags: [LAUNCHPAD_SHEET_TAG] },
  });
  if (!res.ok) {
    throw new SheetResourcesError(
      res.status,
      `Sheet fetch failed: ${res.status}. Confirm the sheet is published to web or shared "anyone with the link can view".`,
    );
  }
  const text = await res.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map(normaliseHeader);
  const idx = (key: string) => headers.indexOf(key);
  const nameI = idx("name");
  const urlI = idx("url");
  const iconI = idx("icon");
  const orderI = idx("order");

  if (nameI === -1 || urlI === -1) {
    throw new SheetResourcesError(
      500,
      `Sheet is missing required columns. Need at least: name, url. Saw: ${headers.join(", ")}`,
    );
  }

  const out: Resource[] = [];
  const seen = new Set<string>();

  rows.slice(1).forEach((row, rowIndex) => {
    const name = (row[nameI] ?? "").trim();
    const link = (row[urlI] ?? "").trim();
    if (!name || !link) return;
    if (!link.startsWith("https://") && !link.startsWith("http://")) return;

    let id = slugify(name);
    let suffix = 1;
    while (seen.has(id)) {
      suffix += 1;
      id = `${slugify(name)}-${suffix}`;
    }
    seen.add(id);

    const orderRaw = orderI >= 0 ? Number(row[orderI]) : NaN;
    const order = Number.isFinite(orderRaw) ? orderRaw : rowIndex;

    out.push({
      id,
      name,
      url: link,
      icon: iconI >= 0 ? (row[iconI] ?? "").trim() || "link" : "link",
      addedBy: "sheet",
      addedAt: new Date().toISOString(),
      order,
    });
  });

  out.sort((a, b) => a.order - b.order);
  return out;
}
