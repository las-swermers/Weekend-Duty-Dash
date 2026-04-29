// Legacy Vercel KV fallback for the launchpad. Used only when
// LAUNCHPAD_SHEET_CSV_URL is not configured. Read-only — the sheet is
// the editable source of truth.

import { kv } from "@vercel/kv";

import { INITIAL_RESOURCES } from "@/lib/mock";
import type { Resource } from "@/types/resource";

const KEY = "resources:v1";

function sortByOrder(list: Resource[]): Resource[] {
  return [...list].sort((a, b) => a.order - b.order);
}

export async function getResources(): Promise<Resource[]> {
  const data = await kv.get<Resource[]>(KEY);
  if (!data) {
    await kv.set(KEY, INITIAL_RESOURCES);
    return sortByOrder(INITIAL_RESOURCES);
  }
  return sortByOrder(data);
}
