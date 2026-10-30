import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("@vercel/kv", () => ({
  kv: { get: vi.fn(), set: vi.fn(), eval: vi.fn() },
}));
vi.mock("@/lib/orah", () => ({
  orahCall: vi.fn(),
  isMockMode: vi.fn(() => false),
}));
vi.mock("@/lib/reports/store", () => ({ storageReady: vi.fn(() => true) }));
import { kv } from "@vercel/kv";
import { orahCall } from "@/lib/orah";
import {
  syncWatchlist,
  fetchWatchlistSnapshot,
  validateTargets,
} from "@/lib/analytics/tracking";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.mocked(kv.get).mockResolvedValue(null);
  vi.mocked(kv.set).mockResolvedValue("OK");
  vi.mocked(kv.eval).mockResolvedValue(1);
});
afterEach(() => vi.unstubAllEnvs());
const r = {
  id: 1,
  student: { id: 1 },
  watchlist: true,
  pastoral_category: { name: "Saturday Clipboard" },
  date: "2026-10-19T12:00:00Z",
  created_at: "2026-10-19T12:00:00Z",
};
it("stores an atomic baseline only after a complete source read", async () => {
  vi.mocked(orahCall).mockResolvedValue({ data: [r] });
  const state = await syncWatchlist();
  expect(state.episodes[0].startAfter).toBeNull();
  const save = vi
    .mocked(kv.eval)
    .mock.calls.find((c) => String(c[0]).includes("redis.call('set'"));
  expect(save).toBeDefined();
  expect(JSON.parse((save![2] as string[])[1]).episodes).toHaveLength(1);
  expect(orahCall).toHaveBeenCalledWith(
    "/open-api/pastoral/timeline",
    expect.objectContaining({
      query: expect.objectContaining({ page_size: 500, page_index: 0 }),
    }),
  );
});
it("does not advance tracking after malformed or repeated source pages", async () => {
  vi.mocked(orahCall).mockResolvedValue({ data: null });
  await expect(syncWatchlist()).rejects.toThrow();
  expect(
    vi
      .mocked(kv.eval)
      .mock.calls.some((c) => String(c[0]).includes("redis.call('set'")),
  ).toBe(false);
  vi.mocked(orahCall).mockResolvedValue({
    data: Array.from({ length: 500 }, (_, i) => ({ ...r, id: i + 1 })),
  });
  await expect(fetchWatchlistSnapshot()).rejects.toThrow("repeated");
});
it("prevents overlapping collectors and rejects expired locks", async () => {
  vi.mocked(kv.set).mockResolvedValue(null);
  await expect(syncWatchlist()).rejects.toThrow("already running");
  expect(orahCall).not.toHaveBeenCalled();
  vi.mocked(kv.set).mockResolvedValue("OK");
  vi.mocked(orahCall).mockResolvedValue({ data: [r] });
  vi.mocked(kv.eval).mockResolvedValue(0);
  await expect(syncWatchlist()).rejects.toThrow("lock expired");
});
it("never collects into shared storage from Vercel previews", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  await expect(syncWatchlist()).rejects.toThrow("preview");
  expect(kv.set).not.toHaveBeenCalled();
  expect(orahCall).not.toHaveBeenCalled();
});
it("validates category targets without inventing defaults", () => {
  expect(validateTargets({})).toEqual({});
  expect(validateTargets({ "Saturday Clipboard": 48 })).toEqual({
    "Saturday Clipboard": 48,
  });
  for (const value of [
    { A: 0 },
    { A: Infinity },
    { A: 24, a: 48 },
    { constructor: 24 },
    [],
    null,
  ])
    expect(() => validateTargets(value)).toThrow();
});
