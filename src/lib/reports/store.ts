import { randomUUID } from "node:crypto";
import { kv } from "@vercel/kv";
import type { ReportRun, RunSummary, Subscription } from "./types";
const CONFIG_KEY = "reports:v1:subscriptions";
const RETENTION = 90 * 86400;
export function storageReady(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}
function ready() {
  if (!storageReady()) throw new Error("Report storage is not configured.");
}
export async function subscriptions(): Promise<Subscription[]> {
  ready();
  const all = await kv.hgetall<Record<string, Subscription>>(CONFIG_KEY);
  return Object.values(all ?? {}).sort((a, b) => a.name.localeCompare(b.name));
}
export async function subscription(id: string): Promise<Subscription | null> {
  ready();
  return kv.hget<Subscription>(CONFIG_KEY, id);
}
export async function saveSubscription(s: Subscription) {
  ready();
  await kv.hset(CONFIG_KEY, { [s.id]: s });
}
export async function deleteSubscription(id: string) {
  ready();
  await kv.hdel(CONFIG_KEY, id);
}
export async function getRun(id: string): Promise<ReportRun | null> {
  ready();
  return kv.get<ReportRun>(`reports:v1:run:${id}`);
}
export async function saveRun(run: ReportRun) {
  ready();
  await kv.set(`reports:v1:run:${run.id}`, run, { ex: RETENTION });
  const summary: RunSummary = {
    snapshotAvailable: true,
    id: run.id,
    subscriptionId: run.subscriptionId,
    name: run.name,
    week: run.week,
    kind: run.kind,
    createdAt: run.createdAt,
    accepted: run.deliveries.filter((d) => d.providerId).length,
    total: run.deliveries.length,
    errors: run.deliveries
      .filter((d) => d.error)
      .map((d) => `${d.email}: ${d.error}`),
  };
  await kv.set(`reports:v1:summary:${run.id}`, summary, { ex: RETENTION });
  await kv.zadd("reports:v1:history", {
    score: Date.parse(run.createdAt),
    member: run.id,
  });
  await kv.zremrangebyscore(
    "reports:v1:history",
    0,
    Date.now() - RETENTION * 1000,
  );
}
export async function history(): Promise<RunSummary[]> {
  ready();
  const ids = await kv.zrange<string[]>("reports:v1:history", 0, 49, {
    rev: true,
  });
  if (!ids.length) return [];
  const rows = await kv.mget<(RunSummary | null)[]>(
    ...ids.map((id) => `reports:v1:summary:${id}`),
  );
  return rows.filter((r): r is RunSummary => r !== null);
}
export async function withLock<T>(
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  ready();
  const lock = `reports:v1:lock:${key}`;
  const token = randomUUID();
  if (!(await kv.set(lock, token, { nx: true, ex: 600 })))
    throw new Error("Report operation already in progress; try again shortly.");
  try {
    return await work();
  } finally {
    await kv.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      [lock],
      [token],
    );
  }
}

export async function getSummary(id: string): Promise<RunSummary | null> {
  ready();
  return kv.get<RunSummary>(`reports:v1:summary:${id}`);
}
export async function recordFailure(
  s: Subscription,
  week: string,
  message: string,
) {
  ready();
  const id = randomUUID();
  const row: RunSummary = {
    id,
    subscriptionId: s.id,
    name: s.name,
    week,
    kind: "weekly",
    createdAt: new Date().toISOString(),
    accepted: 0,
    total: s.recipients.length,
    errors: [message],
    snapshotAvailable: false,
  };
  await kv.set(`reports:v1:summary:${id}`, row, { ex: RETENTION });
  await kv.zadd("reports:v1:history", { score: Date.now(), member: id });
  await kv.zremrangebyscore(
    "reports:v1:history",
    0,
    Date.now() - RETENTION * 1000,
  );
}
