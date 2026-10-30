import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/analytics-auth", () => ({ requireAnalyticsAccess: vi.fn() }));
vi.mock("@/lib/warnings-auth", () => ({ requireWarningsAccess: vi.fn() }));
vi.mock("@/lib/reports/auth", () => ({
  reportsAdmin: vi.fn(),
  sameOrigin: (r: Request) => r.headers.get("origin") === new URL(r.url).origin,
}));
vi.mock("@/lib/analytics/data", () => ({ buildAnalytics: vi.fn() }));
vi.mock("@/lib/analytics/tracking", () => ({
  syncWatchlist: vi.fn(),
  saveTargets: vi.fn(),
  validateTargets: vi.fn((v) => v),
}));
import { requireAnalyticsAccess } from "@/lib/analytics-auth";
import { requireWarningsAccess } from "@/lib/warnings-auth";
import { reportsAdmin } from "@/lib/reports/auth";
import { buildAnalytics } from "@/lib/analytics/data";
import { syncWatchlist } from "@/lib/analytics/tracking";
import { GET } from "@/app/api/analytics/overview/route";
import { POST, PUT } from "@/app/api/analytics/tracking/route";
import { GET as cron } from "@/app/api/cron/watchlist-sync/route";
beforeEach(() => vi.resetAllMocks());
it("denies analytics reads before touching sources", async () => {
  vi.mocked(requireAnalyticsAccess).mockResolvedValue({
    ok: false,
    email: null,
  });
  expect(
    (await GET(new Request("http://local/api/analytics/overview"))).status,
  ).toBe(403);
  expect(buildAnalytics).not.toHaveBeenCalled();
});
it("validates dates and passes separate warnings access, with private no-store responses", async () => {
  vi.mocked(requireAnalyticsAccess).mockResolvedValue({
    ok: true,
    email: "staff@las.ch",
  });
  vi.mocked(requireWarningsAccess).mockResolvedValue({
    ok: false,
    email: "staff@las.ch",
  });
  vi.mocked(reportsAdmin).mockResolvedValue(null);
  vi.mocked(buildAnalytics).mockResolvedValue({ issues: [] } as never);
  expect(
    (
      await GET(
        new Request("http://local/api/analytics/overview?start=bad&end=bad"),
      )
    ).status,
  ).toBe(400);
  const r = await GET(
    new Request(
      "http://local/api/analytics/overview?start=2026-10-19&end=2026-10-25&dorm=374",
    ),
  );
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(buildAnalytics).toHaveBeenCalledWith(
    "2026-10-18T22:00:00.000Z",
    "2026-10-25T22:59:59.999Z",
    374,
    false,
    false,
    false,
  );
});
it("denies unauthorised and cross-origin collection/settings writes", async () => {
  for (const handler of [POST, PUT]) {
    vi.mocked(reportsAdmin).mockResolvedValue(null);
    expect(
      (
        await handler(
          new Request("http://local/api/analytics/tracking", {
            method: "POST",
            headers: { origin: "http://local" },
          }),
        )
      ).status,
    ).toBe(403);
    vi.mocked(reportsAdmin).mockResolvedValue("admin@las.ch");
    expect(
      (
        await handler(
          new Request("http://local/api/analytics/tracking", {
            method: "POST",
            headers: { origin: "http://evil" },
          }),
        )
      ).status,
    ).toBe(403);
  }
  expect(syncWatchlist).not.toHaveBeenCalled();
});
it("requires the cron secret and reports collector failure without source data", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  expect(
    (await cron(new Request("http://local/api/cron/watchlist-sync"))).status,
  ).toBe(401);
  vi.mocked(syncWatchlist).mockRejectedValue(
    new Error("Private source content"),
  );
  const r = await cron(
    new Request("http://local/api/cron/watchlist-sync", {
      headers: { authorization: "Bearer test-secret" },
    }),
  );
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("Private source content");
  vi.unstubAllEnvs();
});
