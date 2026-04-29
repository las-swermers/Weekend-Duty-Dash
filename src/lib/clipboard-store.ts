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
