// Google-Sheets-backed launchpad. The sheet is published to the web as
// CSV (File → Share → Publish to web → CSV); we fetch and parse it on
// each request, with Next's data cache holding the response for a few
// minutes so edits propagate without a redeploy.
//
// Sheet schema (header row required):
//
//   name,url,icon,category,order
//
//   - name      : display label, required
//   - url       : https URL, required
//   - icon      : one of the names in src/components/dashboard/icon.tsx
//                 (link, book, award, users, bus, clipboard, flag,
//                 heart, message, phone, calendar, folder, map, key,
//                 bell). Defaults to "link" if blank/unrecognised.
//   - category  : Reference | Logistics | Health & Wellbeing |
//                 Discipline & Accountability | Communications |
//                 Activities | Admin
//   - order     : optional integer; lower numbers appear first within
//                 the category. Defaults to row order.
//
// Rows where required fields are missing or invalid are skipped.

import { CATEGORIES, type Resource, type ResourceCategory } from "@/types/resource";
import { slugify } from "@/lib/utils";

const SHEET_TTL = 300;
const CATEGORY_SET = new Set<ResourceCategory>(CATEGORIES);

export class SheetError extends Error {
  constructor(
    public status: number,
    message: string,
    public bodyPreview?: string,
  ) {
    super(message);
    this.name = "SheetError";
  }
}

export function isSheetConfigured(): boolean {
  return !!process.env.LAUNCHPAD_SHEET_CSV_URL;
}

// Minimal RFC4180-ish CSV parser. Handles quoted fields, escaped
// double-quotes, CR/LF line endings.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignored — \n closes the row
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

interface RowMap {
  [header: string]: string;
}

function rowsToObjects(rows: string[][]): RowMap[] {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj: RowMap = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
}

function isCategory(value: string): value is ResourceCategory {
  return CATEGORY_SET.has(value as ResourceCategory);
}

function mapRowToResource(
  row: RowMap,
  fallbackOrder: number,
): Resource | null {
  const name = row.name?.trim();
  const url = row.url?.trim();
  const category = row.category?.trim();

  if (!name || !url) return null;
  if (!url.startsWith("https://")) return null;
  if (!isCategory(category)) return null;

  const order = Number.parseInt(row.order ?? "", 10);
  return {
    id: slugify(name),
    name,
    url,
    icon: row.icon?.trim() || "link",
    category,
    addedBy: "sheet",
    addedAt: new Date(0).toISOString(),
    order: Number.isFinite(order) ? order : fallbackOrder,
  };
}

export async function getResourcesFromSheet(): Promise<Resource[]> {
  const url = process.env.LAUNCHPAD_SHEET_CSV_URL;
  if (!url) {
    throw new SheetError(500, "LAUNCHPAD_SHEET_CSV_URL is not configured");
  }
  if (!url.startsWith("https://")) {
    throw new SheetError(500, "LAUNCHPAD_SHEET_CSV_URL must be https");
  }

  const res = await fetch(url, {
    headers: { Accept: "text/csv,text/plain" },
    next: { revalidate: SHEET_TTL },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new SheetError(
      res.status,
      `Sheet fetch ${res.status}`,
      text.slice(0, 200),
    );
  }

  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const objects = rowsToObjects(rows);
  const resources: Resource[] = [];
  objects.forEach((row, idx) => {
    const r = mapRowToResource(row, idx);
    if (r) {
      // Avoid id collisions if two rows have the same name.
      let candidate = r.id;
      let suffix = 1;
      while (resources.some((existing) => existing.id === candidate)) {
        suffix += 1;
        candidate = `${r.id}-${suffix}`;
      }
      resources.push({ ...r, id: candidate });
    }
  });

  return resources.sort((a, b) => a.order - b.order);
}
