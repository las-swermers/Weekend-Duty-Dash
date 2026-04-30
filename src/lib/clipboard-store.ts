// Persistence layer for clipboard tick-offs. State lives in Vercel KV
// (or any compatible Redis) keyed by `clipboard:served:<weekendStartISO>`
// so each weekend has its own bucket. The bucket is a record of
// `recordId -> ServedEntry`, allowing fast existence checks during the
// row render.

import { kv } from "@vercel/kv";

export interface ServedEntry {
  recordId: number;
  servedBy: string;
  servedAt: string;
  note?: string;
  studentName?: string;
  dorm?: string;
  category?: string;
  recordDate?: string;
}

type Bucket = Record<string, ServedEntry>;

function bucketKey(weekendStartISO: string): string {
  return `clipboard:served:${weekendStartISO}`;
}

export async function getServed(
  weekendStartISO: string,
): Promise<ServedEntry[]> {
  const bucket = await kv.get<Bucket>(bucketKey(weekendStartISO));
  if (!bucket) return [];
  return Object.values(bucket);
}

export async function markServed(
  weekendStartISO: string,
  entry: ServedEntry,
): Promise<void> {
  const key = bucketKey(weekendStartISO);
  const bucket = (await kv.get<Bucket>(key)) ?? {};
  bucket[String(entry.recordId)] = {
    ...bucket[String(entry.recordId)],
    ...entry,
  };
  await kv.set(key, bucket);
}

export async function unmarkServed(
  weekendStartISO: string,
  recordId: number,
): Promise<void> {
  const key = bucketKey(weekendStartISO);
  const bucket = (await kv.get<Bucket>(key)) ?? {};
  delete bucket[String(recordId)];
  await kv.set(key, bucket);
}

export async function patchNote(
  weekendStartISO: string,
  recordId: number,
  note: string,
): Promise<ServedEntry | null> {
  const key = bucketKey(weekendStartISO);
  const bucket = (await kv.get<Bucket>(key)) ?? {};
  const existing = bucket[String(recordId)];
  if (!existing) return null;
  const updated = { ...existing, note };
  bucket[String(recordId)] = updated;
  await kv.set(key, bucket);
  return updated;
}

// Returns every served entry across every bucket whose key falls inside
// [startISO, endISO]. Used by resolution analytics. Tolerates KV unavailability
// by returning an empty list.
export async function getAllServedInWindow(
  startISO: string,
  endISO: string,
): Promise<Array<ServedEntry & { bucketISO: string }>> {
  const startMs = Date.parse(startISO);
  const endMs = Date.parse(endISO);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];

  let keys: string[] = [];
  try {
    keys = await kv.keys("clipboard:served:*");
  } catch {
    return [];
  }

  const inWindow = keys.filter((k) => {
    const iso = k.slice("clipboard:served:".length);
    const ms = Date.parse(iso);
    return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
  });
  if (inWindow.length === 0) return [];

  const buckets = await Promise.all(
    inWindow.map(async (k) => {
      try {
        const b = await kv.get<Bucket>(k);
        return { iso: k.slice("clipboard:served:".length), bucket: b ?? {} };
      } catch {
        return { iso: k.slice("clipboard:served:".length), bucket: {} as Bucket };
      }
    }),
  );

  const out: Array<ServedEntry & { bucketISO: string }> = [];
  for (const { iso, bucket } of buckets) {
    for (const entry of Object.values(bucket)) {
      out.push({ ...entry, bucketISO: iso });
    }
  }
  return out;
}
